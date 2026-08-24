import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Casdoor 统一认证对接（AUTH_PROVIDER=casdoor 时启用）
 *
 * ── 架构说明 ──────────────────────────────────────────────────────────
 * Casdoor 完全替代原自建鉴权中心的角色：只负责「验证密码 + 签发/续签 Token」。
 * 用户资料、角色、封禁状态、邀请码仍全部留在本服务（blog-lite）。
 *
 * 用户映射约定（关键）：
 *   Casdoor 用户的 name 字段 = `u<本地users表id>`（如 u123456789）。
 *   Casdoor 签发的 access_token 的 sub claim 即该 name，
 *   verifyCasdoorToken 解析 sub → 还原本地 userId，
 *   因此 AuthGuard / RolesGuard / 业务代码完全无需感知 Casdoor。
 *
 * 登录流程（/user/login 的 casdoor 分支）：
 *   1. 本地按 account(id/email) 查用户（保留防枚举/封禁检查）
 *   2. Casdoor password grant 验证密码并换取双 Token
 *   3. 密码错误 → 统一抛"用户名或密码错误"（与 self 模式文案一致）
 *
 * ── 部署时需要做的（详见 DEPLOY.md「Casdoor 接入」章节）──────────────
 * 1. Casdoor 建组织（默认 org 名建议 blog）与应用 blog-lite
 * 2. 应用开启「Password Credentials Grant」（登录方式中勾选）
 * 3. 填好下方 .env 配置（CASDOOR_*），AUTH_PROVIDER 切为 casdoor
 * 4. 存量用户迁移：需要为每个已有用户在 Casdoor 建对应账号
 *    （name=u<id>，密码可统一重置或引导用户找回——上线前运营决策）
 *
 * ── 未覆盖（casdoor 模式下不可用，接口会返回明确提示）────────────────
 * - 邮箱验证码登录 / 验证码重置密码：凭证在 Casdoor 侧，走 Casdoor 登录页找回
 *   （resetPasswordByCode 已同步调用 Casdoor 改密 API，密码一致）
 */
@Injectable()
export class CasdoorService implements OnModuleInit {
  private readonly logger = new Logger(CasdoorService.name);

  /** 是否启用 casdoor 模式（AUTH_PROVIDER=casdoor 且必填配置齐全） */
  readonly enabled: boolean;

  private readonly endpoint: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  /** Casdoor 组织名（password grant 的 username 前缀 / 建用户用） */
  private readonly orgName: string;

  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.endpoint = (this.configService.get<string>('CASDOOR_ENDPOINT') || '').replace(/\/+$/, '');
    this.clientId = this.configService.get<string>('CASDOOR_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('CASDOOR_CLIENT_SECRET') || '';
    this.orgName = this.configService.get<string>('CASDOOR_ORG_NAME') || 'blog';

    const provider = this.configService.get<string>('AUTH_PROVIDER') || 'self';
    const configured = !!(this.endpoint && this.clientId && this.clientSecret);
    this.enabled = provider === 'casdoor';

    if (this.enabled) {
      if (!configured) {
        // 不抛错阻断启动（避免配置遗漏把整个 API 打挂），登录时会再校验并给出明确提示
        this.logger.error(
          'AUTH_PROVIDER=casdoor 但 CASDOOR_ENDPOINT / CLIENT_ID / CLIENT_SECRET 未配置完整，登录将不可用',
        );
      } else {
        this.logger.log(`Casdoor 模式已启用: ${this.endpoint} org=${this.orgName}`);
      }
    }
  }

  onModuleInit() {
    if (!this.enabled || !this.endpoint) return;
    // Casdoor JWKS 端点：全局 /.well-known/jwks（应用独立证书时用 /.well-known/<app>/jwks）
    const jwksUrl = new URL('/.well-known/jwks', this.endpoint);
    this.jwks = createRemoteJWKSet(jwksUrl);
    this.logger.log(`Casdoor JWKS 端点已初始化: ${jwksUrl.toString()}`);
  }

  /** casdoor 模式且配置完整时返回 true（login/register 分支用） */
  get ready(): boolean {
    return this.enabled && !!(this.endpoint && this.clientId && this.clientSecret);
  }

  /** 本地 userId → Casdoor 用户 name（u<id>） */
  casdoorName(localUserId: number | string): string {
    return `u${localUserId}`;
  }

  /** Casdoor 用户 name → 本地 userId（解析失败返回 null） */
  parseLocalUserId(name: unknown): number | null {
    if (typeof name !== 'string') return null;
    const m = /^u(\d+)$/.exec(name);
    return m ? Number(m[1]) : null;
  }

  /**
   * password grant：验证密码并换取双 Token。
   * Casdoor 要求应用开启 Password Credentials Grant。
   *
   * username 格式：`<org>/<name>`（如 blog/u123456789）。
   * 若部署的 Casdoor 版本不需要 org 前缀，把 prefix 拼接去掉即可（见下 TODO）。
   *
   * @throws Error('invalid_grant'|...) 密码错误/用户不存在时 Casdoor 返回 401 + error
   */
  async passwordGrant(
    localUserId: number,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    // TODO(部署后确认): 部分 Casdoor 版本 password grant 的 username 需要去掉 org 前缀。
    // 若登录报 "user not found"，将 username 改为 this.casdoorName(localUserId) 重试。
    const username = `${this.orgName}/${this.casdoorName(localUserId)}`;
    // 实测该部署对 body 内 client_id/secret 解析有误（报 invalid_client），
    // 必须用 Basic 头携带凭证
    const { data } = await firstValueFrom(
      this.httpService.post(
        `${this.endpoint}/api/login/oauth/access_token`,
        new URLSearchParams({
          grant_type: 'password',
          username,
          password,
          scope: 'openid offline_access',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...this.adminAuthHeaders(),
          },
        },
      ),
    );
    if (!data?.access_token) {
      const err = new Error(data?.error_description || data?.error || 'Casdoor 登录失败');
      this.logger.warn(`password grant 失败 userId=${localUserId}: ${err.message}`);
      throw err;
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || '',
      expiresIn: Number(data.expires_in) || 3600,
    };
  }

  /**
   * refresh_token grant：续签双 Token（/user/refresh 的 casdoor 分支）。
   * Casdoor 要求应用开启 refresh token（offline access）。
   */
  async refreshGrant(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const { data } = await firstValueFrom(
      this.httpService.post(
        `${this.endpoint}/api/login/oauth/access_token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...this.adminAuthHeaders(),
          },
        },
      ),
    );
    if (!data?.access_token) {
      throw new Error(data?.error_description || data?.error || 'refresh_token 无效');
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: Number(data.expires_in) || 3600,
    };
  }

  /**
   * 本地验签 Casdoor 签发的 access_token，并把 sub（u<id>）映射回本地 userId。
   * 返回 payload 的 sub = String(本地userId)，与 self 模式完全一致，AuthGuard 无感。
   */
  async verifyCasdoorToken(accessToken: string): Promise<Record<string, unknown>> {
    if (!this.jwks) {
      throw new Error('Casdoor JWKS 未初始化（检查 CASDOOR_ENDPOINT 配置）');
    }
    const { payload } = await jwtVerify(accessToken, this.jwks, {
      // issuer = Casdoor 站点地址（Casdoor 的 iss 即 endpoint）
      issuer: this.endpoint,
      // Casdoor JWT 统一 RS256 签名，显式限定防算法混用
      algorithms: ['RS256'],
    });
    const localUserId = this.parseLocalUserId(payload.sub);
    if (!localUserId) {
      // token 有效但不是本应用同步的用户（如管理员手动在 Casdoor 建的账号）
      throw new Error(`Casdoor token 的 sub 无法映射本地用户: ${String(payload.sub)}`);
    }
    return { ...payload, sub: String(localUserId) };
  }

  // ── 管理 API（注册同步 / 改密同步）──────────────────────────────────
  // Casdoor 管理 API 用应用自己的 Client ID/Client Secret 做 Basic auth，
  // 权限限定在本应用所属组织内——不需要、也不应该用全局管理员账号。

  private adminAuthHeaders() {
    return {
      Authorization:
        'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
    };
  }

  /**
   * 注册同步：在 Casdoor 创建对应用户（name=u<id>，密码与本地一致）。
   * 只有这一步做了，注册的用户才能用注册密码登录。
   * 失败时调用方应中断注册（提示用户稍后重试），避免出现"本地有账号但登录不了"的孤儿。
   */
  async createCasdoorUser(params: {
    localUserId: number;
    nickname: string;
    password: string;
    email?: string | null;
  }): Promise<void> {
    const body = {
      name: this.casdoorName(params.localUserId),
      organization: this.orgName,
      displayName: params.nickname,
      email: params.email || '',
      password: params.password,
      // 评分/国家等字段给默认值，避免 Casdoor 校验拒收
      score: 0,
      country: 'CN',
    };
    const { data } = await firstValueFrom(
      this.httpService.post(`${this.endpoint}/api/add-user`, body, {
        headers: this.adminAuthHeaders(),
      }),
    );
    // Casdoor 管理 API 统一返回 { status: 'ok' | 'error', msg, data: affected }
    if (data?.status !== 'ok' || !data?.data) {
      throw new Error(data?.msg || 'Casdoor 创建用户失败');
    }
    this.logger.log(`Casdoor 用户已同步: ${this.casdoorName(params.localUserId)}`);
  }

  /**
   * 改密同步：本地改密后（admin 重置 / 验证码重置）同步更新 Casdoor 密码。
   * best-effort：失败仅记日志，不阻塞本地改密（用户可用 Casdoor 找回）。
   */
  async updateCasdoorPassword(
    localUserId: number,
    newPassword: string,
  ): Promise<void> {
    try {
      const { data: existing } = await firstValueFrom(
        this.httpService.get(
          `${this.endpoint}/api/get-user?id=${this.orgName}/${this.casdoorName(localUserId)}`,
          { headers: this.adminAuthHeaders() },
        ),
      );
      if (!existing || existing.status === 'error' || !existing.data?.name) {
        this.logger.warn(
          `Casdoor 用户不存在，跳过改密同步: ${this.casdoorName(localUserId)}`,
        );
        return;
      }
      const body = { ...existing.data, password: newPassword };
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.endpoint}/api/update-user`, body, {
          headers: this.adminAuthHeaders(),
        }),
      );
      if (data?.status !== 'ok') {
        this.logger.warn(`Casdoor 改密同步失败: ${data?.msg || '未知原因'}`);
      }
    } catch (e) {
      this.logger.warn(
        `Casdoor 改密同步异常（不阻塞本地改密）: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * 吊销 refreshToken（登出）。Casdoor 的 revocation 端点按版本可能是
   * /api/revoke-token（按 token 吊销）。best-effort：失败不阻塞登出，
   * refreshToken 自然过期（默认 7 天）兜底。
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.endpoint}/api/revoke-token`, null, {
          params: { token: refreshToken },
          headers: this.adminAuthHeaders(),
        }),
      );
    } catch (e) {
      // 未知端点/网络失败都不阻塞登出（与 self 模式 revokeToken 的容错一致）
      this.logger.warn(
        `Casdoor 吊销 refreshToken 失败（不影响登出）: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

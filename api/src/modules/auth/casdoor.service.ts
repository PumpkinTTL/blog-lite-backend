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
  /** 本站在 Casdoor 的应用名（用户 signupApplication 标记，后台"应用"列显示用） */
  private readonly appName: string;

  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.endpoint = (this.configService.get<string>('CASDOOR_ENDPOINT') || '').replace(/\/+$/, '');
    this.clientId = this.configService.get<string>('CASDOOR_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('CASDOOR_CLIENT_SECRET') || '';
    this.orgName = this.configService.get<string>('CASDOOR_ORG_NAME') || 'blog';
    this.appName = this.configService.get<string>('CASDOOR_APP_NAME') || 'blog-lite';

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
    // 显式超时/冷却：jose 默认 timeoutDuration=5s 且失败不进冷却——Casdoor JWKS
    // 端点故障时每个带 token 的请求都要先挂 5s 再 401，认证通道整体延迟雪崩。
    // 收紧到 3s + 失败冷却 60s（冷却期内直接用上次结果/立即失败，不重复拉取）
    this.jwks = createRemoteJWKSet(jwksUrl, {
      timeoutDuration: 3000,
      cooldownDuration: 60_000,
    });
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
    // 实测（auth.bitlesu.com）：username 用裸用户名（u<id>），不带 org 前缀；
    // Casdoor 在应用上下文中按应用所属组织查找用户。
    const username = this.casdoorName(localUserId);
    // 实测：该部署对 body 内 client_id/secret 解析有误（报 invalid_client），
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
      // aud = 本应用的 client_id：其他应用（以后商城等）签发的 token 到这里直接被拒
      audience: this.clientId,
      // Casdoor 证书系统支持 RSA(RS256)/ECDSA(ES256)，无 Ed25519。
      // 白名单三种非对称算法：部署方换证书类型无需改代码；JWKS 按 kid
      // 匹配公钥，实际可用算法受 JWKS 里的 key 类型约束。
      algorithms: ['RS256', 'ES256', 'EdDSA'],
    });
    // 实测（auth.bitlesu.com）：Casdoor JWT 的 sub 是其内部 UUID（不是用户 name），
    // 用户名在 payload.name 字段（Casdoor 会把整个用户对象放进 JWT claims）。
    // 映射链：payload.name = "u<本地userId>" → 本地用户；sub 仅作兜底。
    // 纵深防御（红队 V1）：name 即本地账号名，若 Casdoor 侧放开了自助注册，
    // 攻击者可抢注 name=u<受害者id> 的账号伪造身份。应用来源校验：
    // token 带 signupApplication claim 且 ≠ 本应用时拒绝（claim 缺省的旧版本兼容跳过）。
    // 【上线硬前置】Casdoor 后台 blog-lite 应用必须关闭「自助注册」。
    const signupApp = (payload as { signupApplication?: unknown }).signupApplication;
    if (typeof signupApp === 'string' && signupApp !== this.appName) {
      throw new Error(
        `Casdoor token 来源应用不匹配: ${signupApp}（期望 ${this.appName}），疑似跨应用/抢注 token`,
      );
    }
    const localUserId = this.parseLocalUserId(
      (payload as { name?: unknown }).name ?? payload.sub,
    );
    if (!localUserId) {
      // token 有效但不是本应用同步的用户（如管理员手动在 Casdoor 建的账号）
      throw new Error(
        `Casdoor token 无法映射本地用户: name=${String((payload as { name?: unknown }).name)}`,
      );
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
    avatar?: string | null;
  }): Promise<void> {
    const body = {
      // 实测（auth.bitlesu.com）：该版本要求同时传 owner + organization，
      // 只传 organization 会报 "The organization: does not exist"
      owner: this.orgName,
      name: this.casdoorName(params.localUserId),
      organization: this.orgName,
      displayName: params.nickname,
      email: params.email || '',
      password: params.password,
      // 来源应用标记：Casdoor 后台用户列表"应用"列显示用（多应用区分用户来自哪）
      signupApplication: this.appName,
      // 注册时已带头像则一并同步（web 注册通常为空，第三方接入可能携带）
      ...(params.avatar ? { avatar: params.avatar } : {}),
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
   * 改密同步：更新 Casdoor 侧密码。
   * 返回是否成功——Casdoor 是凭据真相源，调用方（resetPassword/update）必须
   * 在成功后才落本地库（审查 P0：曾因静默吞错导致"重置成功但旧密码仍有效"）。
   * Casdoor 无此号返回 false（调用方提示走 sync-casdoor 补建）。
   */
  async updateCasdoorPassword(
    localUserId: number,
    newPassword: string,
  ): Promise<boolean> {
    try {
      const { data: existing } = await firstValueFrom(
        this.httpService.get(
          `${this.endpoint}/api/get-user?id=${this.orgName}/${this.casdoorName(localUserId)}`,
          { headers: this.adminAuthHeaders() },
        ),
      );
      if (!existing || existing.status === 'error' || !existing.data?.name) {
        this.logger.warn(
          `Casdoor 用户不存在，改密同步未执行: ${this.casdoorName(localUserId)}`,
        );
        return false;
      }
      const body = { ...existing.data, password: newPassword };
      // 实测：update-user 必须在 URL 带 ?id=org/name 指明目标用户，
      // 不带时 Casdoor 会按 client 身份定位（app/blog-lite）导致 "user doesn't exist"
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/api/update-user?id=${this.orgName}/${this.casdoorName(localUserId)}`,
          body,
          { headers: this.adminAuthHeaders() },
        ),
      );
      if (data?.status !== 'ok') {
        this.logger.error(`Casdoor 改密同步失败: ${data?.msg || '未知原因'}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error(
        `Casdoor 改密同步异常: ${e instanceof Error ? e.message : e}`,
      );
      return false;
    }
  }

  /**
   * 删除用户同步（admin 删除用户时清理 Casdoor 侧账号）。
   * best-effort：失败仅记日志——本地已删则该账号已无法登录
   * （login 先查本地 users 表），Casdoor 残留只是脏数据，可后台手动清。
   */
  async deleteCasdoorUser(localUserId: number): Promise<void> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/api/delete-user`,
          { owner: this.orgName, name: this.casdoorName(localUserId) },
          { headers: this.adminAuthHeaders() },
        ),
      );
      if (data?.status !== 'ok') {
        this.logger.warn(
          `Casdoor 删除用户返回失败（不阻塞）: ${data?.msg || '未知原因'}`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Casdoor 删除用户异常（不阻塞）: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Casdoor 侧是否存在指定用户的账号（对账同步用） */
  async userExists(localUserId: number): Promise<boolean> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(
          `${this.endpoint}/api/get-user?id=${this.orgName}/${this.casdoorName(localUserId)}`,
          { headers: this.adminAuthHeaders() },
        ),
      );
      return !!(data && data.status !== 'error' && data.data?.name);
    } catch {
      return false;
    }
  }

  /**
   * 资料同步入口（业务代码统一调这个，不再直接碰 syncCasdoorProfile）：
   * 内部处理 casdoor 模式判断 + 本地字段名→Casdoor 字段名映射 + 未变更跳过。
   * 传本地字段名（nickname/avatar/email/phone），undefined = 本次未改不动它。
   */
  async syncProfileFromLocal(
    localUserId: number,
    changed: { nickname?: unknown; avatar?: unknown; email?: unknown; phone?: unknown },
  ): Promise<void> {
    if (!this.enabled) return;
    const patch: { displayName?: string | null; avatar?: string | null; email?: string | null; phone?: string | null } = {};
    if (changed.nickname !== undefined) patch.displayName = changed.nickname as string | null;
    if (changed.avatar !== undefined) patch.avatar = changed.avatar as string | null;
    if (changed.email !== undefined) patch.email = changed.email as string | null;
    if (changed.phone !== undefined) patch.phone = changed.phone as string | null;
    if (Object.keys(patch).length > 0) {
      await this.syncCasdoorProfile(localUserId, patch);
    }
  }

  /**
   * 资料同步（展示类字段：显示名/头像/邮箱/手机号）。
   * 本地 updateProfile / admin 改用户资料时 best-effort 同步，失败仅记日志——
   * Casdoor 侧资料只是快照（业务展示全读本地库），滞后无害。
   * 结构字段（组织/应用/名称）与权限字段（禁用/删除/管理员）不在此同步，
   * 各有专门通道或建号时定死。
   */
  async syncCasdoorProfile(
    localUserId: number,
    patch: { displayName?: string | null; avatar?: string | null; email?: string | null; phone?: string | null },
  ): Promise<void> {
    try {
      const { data: existing } = await firstValueFrom(
        this.httpService.get(
          `${this.endpoint}/api/get-user?id=${this.orgName}/${this.casdoorName(localUserId)}`,
          { headers: this.adminAuthHeaders() },
        ),
      );
      if (!existing || existing.status === 'error' || !existing.data?.name) {
        return; // Casdoor 无此号（未同步/已删），静默跳过
      }
      const body = { ...existing.data };
      if (patch.displayName !== undefined) body.displayName = patch.displayName ?? '';
      if (patch.avatar !== undefined) body.avatar = patch.avatar ?? '';
      if (patch.email !== undefined) body.email = patch.email ?? '';
      if (patch.phone !== undefined) body.phone = patch.phone ?? '';
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/api/update-user?id=${this.orgName}/${this.casdoorName(localUserId)}`,
          body,
          { headers: this.adminAuthHeaders() },
        ),
      );
      if (data?.status !== 'ok') {
        this.logger.warn(`Casdoor 资料同步失败: ${data?.msg || '未知原因'}`);
      }
    } catch (e) {
      this.logger.warn(
        `Casdoor 资料同步异常（不阻塞）: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * 封禁/解封同步（Casdoor 用户的 isForbidden 标志）。
   * Casdoor 侧封禁后：password grant 登录直接拒绝、refresh grant 续签不放行——
   * 等价于自建模式的 revokeUserTokens（吊销该用户全部会话）。
   * best-effort：失败仅记日志——本地 status 已改，AuthGuard 拦截兜底。
   */
  async setCasdoorUserForbidden(
    localUserId: number,
    forbidden: boolean,
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
          `Casdoor 用户不存在，跳过封禁同步: ${this.casdoorName(localUserId)}`,
        );
        return;
      }
      const body = { ...existing.data, isForbidden: forbidden };
      // 同 updateCasdoorPassword：URL 必须带 ?id=org/name 定位目标用户
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/api/update-user?id=${this.orgName}/${this.casdoorName(localUserId)}`,
          body,
          { headers: this.adminAuthHeaders() },
        ),
      );
      if (data?.status !== 'ok') {
        this.logger.warn(
          `Casdoor 封禁同步失败（${forbidden ? '封禁' : '解封'}）: ${data?.msg || '未知原因'}`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Casdoor 封禁同步异常（不阻塞本地操作）: ${e instanceof Error ? e.message : e}`,
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

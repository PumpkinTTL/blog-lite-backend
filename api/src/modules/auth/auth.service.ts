import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { CasdoorService } from './casdoor.service';
import { LOCAL_ISSUER, LocalTokenService } from './local-token.service';

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly authCenterUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly casdoor: CasdoorService,
    private readonly localToken: LocalTokenService,
  ) {
    // casdoor 模式下这些配置仅 self 流程使用，不再强制必填
    if (!this.casdoor.enabled) {
      this.authCenterUrl =
        this.configService.getOrThrow<string>('AUTH_CENTER_URL');
      this.clientId = this.configService.getOrThrow<string>('AUTH_CLIENT_ID');
      this.clientSecret =
        this.configService.getOrThrow<string>('AUTH_CLIENT_SECRET');
    } else {
      this.authCenterUrl = '';
      this.clientId = '';
      this.clientSecret = '';
    }
  }

  onModuleInit() {
    if (this.casdoor.enabled) {
      // JWKS 由 CasdoorService 初始化（见 casdoor.service.ts）
      return;
    }
    const jwksUrl = new URL('/jwks/.well-known/jwks.json', this.authCenterUrl);
    this.jwks = createRemoteJWKSet(jwksUrl);
    this.logger.log(`JWKS 端点已初始化: ${jwksUrl.toString()}`);
  }

  /**
   * 调用鉴权中心 POST /auth/token 签发双 Token
   * （仅 self 模式；casdoor 模式下 Token 由 Casdoor OIDC 流程签发，
   *  login/register 走 casdoor.passwordGrant，不走本方法）
   */
  async issueToken(
    userId: string | number,
    deviceId: string,
    accessCustomData?: Record<string, unknown>,
    refreshCustomData?: Record<string, unknown>,
    accessTtl?: number,
    refreshTtl?: number,
  ): Promise<AuthTokenResponse> {
    const body: Record<string, unknown> = {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      userId: String(userId),
      deviceId,
    };
    if (accessCustomData) body.accessCustomData = accessCustomData;
    if (refreshCustomData) body.refreshCustomData = refreshCustomData;
    if (accessTtl) body.accessTtl = accessTtl;
    if (refreshTtl) body.refreshTtl = refreshTtl;

    const { data } = await firstValueFrom(
      this.httpService.post(`${this.authCenterUrl}/auth/token`, body),
    );

    if (!data.success) {
      this.logger.error(`签发 Token 失败: ${data.message}`);
      throw new Error(data.message || '鉴权中心签发 Token 失败');
    }

    return data.data;
  }

  /**
   * 本地验签 Access Token（通过 JWKS 公钥）。
   * - 本地短命 token（验证码登录签发，iss=blog-lite-local）：LocalTokenService 验签
   * - self 模式：自建鉴权中心 JWKS
   * - casdoor 模式：Casdoor JWKS，并把 sub（u<id>）映射回本地 userId
   */
  async verifyToken(accessToken: string) {
    // 先不验签解出 iss 做分流：仅读 payload 不验证签名。
    // 分流基于未验签的 iss 是安全的——三个分支各自做完整验签，
    // 伪造 iss 指到哪个分支都过不了该分支的签名校验。
    let iss: unknown;
    try {
      iss = decodeJwt(accessToken).iss;
    } catch {
      // 格式非法（非 JWT）→ 继续走原分支，由其抛出统一验签错误
      iss = undefined;
    }
    if (iss === LOCAL_ISSUER) {
      return this.localToken.verifyAccessToken(accessToken);
    }
    if (this.casdoor.enabled) {
      return this.casdoor.verifyCasdoorToken(accessToken);
    }
    if (!this.jwks) {
      throw new Error('JWKS 未初始化');
    }
    const { payload } = await jwtVerify(accessToken, this.jwks, {
      // 鉴权中心签发时固定 issuer='auth-center'（协议无 aud claim，无法校验受众）。
      // 显式限定 issuer + 算法，拒绝其他来源/其他算法签发的 token。
      issuer: 'auth-center',
      algorithms: ['EdDSA'],
    });
    return payload;
  }

  /**
   * 调用鉴权中心 POST /auth/refresh 刷新双 Token。
   *
   * 注意：鉴权中心有专门的 /auth/refresh 端点（只需 refreshToken + deviceId，
   * 内部从 Redis 反查 userId/clientId，是标准 OAuth2 设计）。
   * 不能调 /auth/token（带 grantType）——那个端点强制要求 userId，
   * 而续签时后端没有 userId（refreshToken 是随机串），会导致 401。
   */
  async refreshToken(
    refreshToken: string,
    deviceId: string,
  ): Promise<AuthTokenResponse> {
    // casdoor 模式：refresh_token grant（deviceId 仅前端会话标识，Casdoor 不感知）
    if (this.casdoor.enabled) {
      const t = await this.casdoor.refreshGrant(refreshToken);
      return {
        accessToken: t.accessToken,
        refreshToken: t.refreshToken,
        expiresIn: t.expiresIn,
        tokenType: 'Bearer',
      };
    }
    const body: Record<string, unknown> = {
      refreshToken,
      deviceId,
    };

    const { data } = await firstValueFrom(
      this.httpService.post(`${this.authCenterUrl}/auth/refresh`, body),
    );

    if (!data.success) {
      this.logger.error(`刷新 Token 失败: ${data.message}`);
      throw new UnauthorizedException(data.message || '刷新 Token 失败');
    }

    return data.data;
  }

  /**
   * 吊销单个 refreshToken（用户登出场景）。
   * 调用鉴权中心公开接口 POST /auth/revoke（无需鉴权，只需 refreshToken）。
   * @param refreshToken 要吊销的 refreshToken
   */
  async revokeToken(refreshToken: string): Promise<void> {
    // casdoor 模式：调 Casdoor 吊销端点（best-effort，失败不阻塞登出）
    if (this.casdoor.enabled) {
      await this.casdoor.revokeRefreshToken(refreshToken);
      return;
    }
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.authCenterUrl}/auth/revoke`, {
          refreshToken,
        }),
      );
      // 鉴权中心返回失败时（如 refreshToken 已过期/无效），只记日志不抛错：
      // 登出场景下，token 失效不应阻塞用户退出
      if (data?.success === false) {
        this.logger.warn(
          `吊销 refreshToken 返回失败：${data.message || '未知原因'}`,
        );
        return;
      }
      this.logger.log('已吊销 refreshToken（登出）');
    } catch (err) {
      // 鉴权中心不可用不阻塞登出（本地态已在调用方清理）
      this.logger.warn(`吊销 refreshToken 请求失败：${err.message}`);
    }
  }

  /**
   * 按 userId 批量吊销该用户在鉴权中心的所有 refreshToken。
   * 调用鉴权中心 POST /auth/revoke-by-user（子端用 clientId/secret 鉴权，非管理员密钥）。
   * 用途：封禁用户时调用，立即吊销其所有会话，防止被封用户无限 refresh。
   *
   * 容错：吊销失败时仅记 warn 日志，不抛错——AuthGuard 查 status 已兜底拦截业务请求。
   *
   * @param userId 要吊销的用户 ID
   * @param deviceId 可选，传则只吊销指定设备；不传吊销该用户所有设备
   */
  async revokeUserTokens(
    userId: string | number,
    deviceId?: string,
  ): Promise<void> {
    // casdoor 模式：等价动作是封禁 Casdoor 用户（setCasdoorUserForbidden），
    // 由 toggleStatus 调用。这里防误调（authCenterUrl 为空会打出无效请求）。
    if (this.casdoor.enabled) {
      this.logger.warn(
        'casdoor 模式下 revokeUserTokens 不适用（应调 casdoor.setCasdoorUserForbidden），已跳过',
      );
      return;
    }
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.authCenterUrl}/auth/revoke-by-user`, {
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          userId: String(userId),
          ...(deviceId ? { deviceId } : {}),
        }),
      );
      if (!data?.success) {
        this.logger.warn(
          `吊销用户 ${userId} Token 失败（鉴权中心返回失败）: ${data?.message}`,
        );
        return;
      }
      this.logger.log(`已吊销用户 ${userId} 的所有 Token`);
    } catch (e) {
      // 吊销失败不阻塞封禁流程：AuthGuard 查 status 会拦截业务请求
      this.logger.warn(
        `吊销用户 ${userId} Token 异常（已降级，不影响封禁）: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

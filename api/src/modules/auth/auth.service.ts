import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';

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
  ) {
    this.authCenterUrl =
      this.configService.getOrThrow<string>('AUTH_CENTER_URL');
    this.clientId = this.configService.getOrThrow<string>('AUTH_CLIENT_ID');
    this.clientSecret =
      this.configService.getOrThrow<string>('AUTH_CLIENT_SECRET');
  }

  onModuleInit() {
    const jwksUrl = new URL('/jwks/.well-known/jwks.json', this.authCenterUrl);
    this.jwks = createRemoteJWKSet(jwksUrl);
    this.logger.log(`JWKS 端点已初始化: ${jwksUrl.toString()}`);
  }

  /**
   * 调用鉴权中心 POST /auth/token 签发双 Token
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
   * 本地验签 Access Token（通过 JWKS 公钥）
   */
  async verifyToken(accessToken: string) {
    if (!this.jwks) {
      throw new Error('JWKS 未初始化');
    }
    const { payload } = await jwtVerify(accessToken, this.jwks);
    return payload;
  }

  /**
   * 调用鉴权中心 POST /auth/token 刷新双 Token
   */
  async refreshToken(
    refreshToken: string,
    deviceId: string,
  ): Promise<AuthTokenResponse> {
    const body: Record<string, unknown> = {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      grantType: 'refresh_token',
      refreshToken,
      deviceId,
    };

    const { data } = await firstValueFrom(
      this.httpService.post(`${this.authCenterUrl}/auth/token`, body),
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
    await firstValueFrom(
      this.httpService.post(`${this.authCenterUrl}/auth/revoke`, {
        refreshToken,
      }),
    );
    this.logger.log('已吊销 refreshToken（登出）');
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

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
    this.authCenterUrl = this.configService.getOrThrow<string>('AUTH_CENTER_URL');
    this.clientId = this.configService.getOrThrow<string>('AUTH_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow<string>('AUTH_CLIENT_SECRET');
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
  ): Promise<AuthTokenResponse> {
    const body: Record<string, unknown> = {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      userId: String(userId),
      deviceId,
    };
    if (accessCustomData) body.accessCustomData = accessCustomData;
    if (refreshCustomData) body.refreshCustomData = refreshCustomData;

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
}

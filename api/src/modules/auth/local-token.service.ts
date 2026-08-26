import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  SignJWT,
} from 'jose';

/** 本地签发 JWT 的固定 issuer（AuthService.verifyToken 按 iss 分流用） */
export const LOCAL_ISSUER = 'blog-lite-local';

/** AT 有效期：2 小时（秒） */
const ACCESS_TTL_SECONDS = 2 * 60 * 60;
/** RT 有效期：7 天（秒） */
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
/** RT 字符串前缀（续签时无歧义识别本地 token） */
export const REFRESH_TOKEN_PREFIX = 'local-';

/** 本地签发的双 Token（refreshToken 带 local- 前缀） */
export interface LocalTokenPair {
  accessToken: string;
  refreshToken: string;
  /** AT 有效期（秒），与自建/casdoor 模式的 expiresIn 语义一致 */
  expiresIn: number;
}

/**
 * 本地短命 Token 服务（C'' 方案）。
 *
 * 背景：casdoor 模式下 Casdoor 只有单密码模型、无免密签发能力，
 * 邮箱验证码登录（loginByCode）无法让 Casdoor 签发 Token。
 * 本服务用本地 Ed25519 私钥直接签发短命 JWT 补上该场景：
 * - AT：iss=blog-lite-local，exp 2 小时，claims 带 roles，
 *   由 AuthService.verifyToken 按 iss 分流到本地验签（与 casdoor/self 并存）。
 * - RT：typ=refresh，exp 7 天，jti 随机；字符串加 `local-` 前缀，
 *   /user/refresh 据此前缀走本地旋转续签，不透传给 Casdoor。
 *
 * 密钥管理（重启不换钥，换了所有已发 token 立即失效）：
 * 1. 优先读 env LOCAL_JWT_PRIVATE_KEY（Ed25519 私钥 JWK JSON 字符串）
 * 2. 其次读项目根 .local-jwt-key.json（{ privateJwk: {...}}）
 * 3. 都没有则自动生成并持久化到该文件（已在 .gitignore，绝不入库）
 */
@Injectable()
export class LocalTokenService implements OnModuleInit {
  private readonly logger = new Logger(LocalTokenService.name);
  private readonly keyFile: string;

  /** Ed25519 私钥（签名用） */
  private privateKey!: CryptoKey;
  /** Ed25519 公钥（验签用） */
  private publicKey!: CryptoKey;

  constructor(private readonly configService: ConfigService) {
    // nest start --watch 的 cwd = backend/api（项目根）
    this.keyFile = join(process.cwd(), '.local-jwt-key.json');
  }

  async onModuleInit(): Promise<void> {
    // 1. env 优先（生产部署推荐：密钥由环境注入，磁盘无痕）
    const envJwk = this.configService.get<string>('LOCAL_JWT_PRIVATE_KEY');
    if (envJwk) {
      await this.loadFromJwk(JSON.parse(envJwk), 'env(LOCAL_JWT_PRIVATE_KEY)');
      return;
    }

    // 2. 密钥文件（重启复用，token 不因重启失效）
    try {
      const raw = await readFile(this.keyFile, 'utf-8');
      const parsed = JSON.parse(raw) as { privateJwk?: Record<string, unknown> };
      if (parsed?.privateJwk?.d) {
        await this.loadFromJwk(parsed.privateJwk, `文件(${this.keyFile})`);
        return;
      }
      this.logger.warn(`密钥文件格式异常（缺 privateJwk.d），将重新生成: ${this.keyFile}`);
    } catch {
      // 文件不存在 → 走生成
    }

    // 3. 首次启动：生成 Ed25519 密钥对并持久化
    const { publicKey, privateKey } = await generateKeyPair('Ed25519', {
      extractable: true,
    });
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    const privateJwk = await exportJWK(privateKey);
    await writeFile(this.keyFile, JSON.stringify({ privateJwk }, null, 2));
    this.logger.log(
      `本地 JWT 密钥：新生成并写入 ${this.keyFile}（该文件已 gitignore）`,
    );
  }

  /** 从私钥 JWK 导入签名/验签密钥 */
  private async loadFromJwk(
    privateJwk: Record<string, unknown>,
    source: string,
  ): Promise<void> {
    this.privateKey = await this.importKey(privateJwk);
    // 公钥 = 私钥 JWK 去掉 d 字段（保留 kty/crv/x）
    const { d: _d, ...publicJwk } = privateJwk;
    this.publicKey = await this.importKey(publicJwk);
    this.logger.log(`本地 JWT 密钥来源: ${source}`);
  }

  /** importJWK 的返回值收窄为 CryptoKey（EdDSA okp JWK 不会出 Uint8Array，那是对称 HSM oct 才有） */
  private async importKey(jwk: Record<string, unknown>): Promise<CryptoKey> {
    const key = await importJWK(jwk as never, 'EdDSA');
    if (!(key instanceof CryptoKey)) {
      throw new Error('Ed25519 JWK 导入结果不是 CryptoKey（密钥格式错误）');
    }
    return key;
  }

  /**
   * 签发 AT + RT 对。
   * AT：iss=blog-lite-local / aud=blog-lite / exp 2h / roles claim
   * RT：typ=refresh / exp 7d / jti 随机，字符串前缀 `local-`
   * ver：用户 token 版本号（Redis 递增）。改密/封禁时递增 → 所有旧 RT 失效，
   * 补上无状态 JWT 唯一缺失的"全量吊销"能力。默认 0（历史无版本 token 也按 0 处理）
   */
  async signTokenPair(
    userId: number,
    roles: string[],
    ver = 0,
  ): Promise<LocalTokenPair> {
    const now = Math.floor(Date.now() / 1000);

    const accessToken = await new SignJWT({ roles })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setIssuer(LOCAL_ISSUER)
      .setAudience('blog-lite')
      .setSubject(String(userId))
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TTL_SECONDS)
      .sign(this.privateKey);

    // typ 放 payload（header 的 typ 固定为 JWT）：verifyRefreshToken 校验用
    const refreshToken = await new SignJWT({ typ: 'refresh', ver })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setIssuer(LOCAL_ISSUER)
      .setAudience('blog-lite')
      .setSubject(String(userId))
      .setIssuedAt(now)
      .setExpirationTime(now + REFRESH_TTL_SECONDS)
      .setJti(randomUUID())
      .sign(this.privateKey);

    return {
      accessToken,
      refreshToken: REFRESH_TOKEN_PREFIX + refreshToken,
      expiresIn: ACCESS_TTL_SECONDS,
    };
  }

  /**
   * 验签本地 AT（issuer/audience/算法全校验）。
   * 失败抛 jose 错误（调用方 AuthGuard 转 401）。
   */
  async verifyAccessToken(token: string): Promise<Record<string, unknown>> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      issuer: LOCAL_ISSUER,
      audience: 'blog-lite',
      algorithms: ['EdDSA'],
    });
    // 防 RT 去掉 local- 前缀后冒充 AT（RT 有效期 7 天，必须拒掉）
    if (payload.typ === 'refresh') {
      throw new Error('不能把 refresh token 当 accessToken 使用');
    }
    return payload as Record<string, unknown>;
  }

  /**
   * 验签本地 RT：剥掉 `local-` 前缀后验签，并校验 typ==='refresh'。
   * 失败抛错（调用方统一转 401「登录已过期」）。
   */
  async verifyRefreshToken(token: string): Promise<Record<string, unknown>> {
    if (!token.startsWith(REFRESH_TOKEN_PREFIX)) {
      throw new Error('非本地 refreshToken（缺少 local- 前缀）');
    }
    const jwt = token.slice(REFRESH_TOKEN_PREFIX.length);
    const { payload } = await jwtVerify(jwt, this.publicKey, {
      issuer: LOCAL_ISSUER,
      audience: 'blog-lite',
      algorithms: ['EdDSA'],
    });
    if (payload.typ !== 'refresh') {
      throw new Error('token 类型错误（非 refresh token）');
    }
    return payload as Record<string, unknown>;
  }
}

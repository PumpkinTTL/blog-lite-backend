/**
 * Storage Provider — 统一云存储抽象层
 *
 * 基于 @aws-sdk/client-s3 (S3 兼容协议) 实现，兼容以下平台：
 *
 * ┌────────────┬────────────────────────────────────────────────────────┐
 * │ 平台        │ S3 Endpoint 格式                        │ 是否自动推断 │
 * ├────────────┼────────────────────────────────────────────────────────┤
 * │ 阿里云 OSS  │ https://oss-{region}.aliyuncs.com       │ ✅ 是       │
 * │ 腾讯云 COS  │ https://cos.{region}.myqcloud.com       │ ✅ 是       │
 * │ Cloudflare  │ https://{account_id}.r2.cloudflarestorage.com │ ❌ 必填 │
 * │ Backblaze   │ https://s3.{region}.backblazeb2.com     │ ✅ 是       │
 * │ 本地文件系统 │ —                                        │ —          │
 * └────────────┴────────────────────────────────────────────────────────┘
 *
 * 配置示例：
 *
 * ```ts
 * // ======== 阿里云 OSS ========
 * new StorageProvider({
 *   provider: 'aliyun',
 *   region: 'cn-hangzhou',
 *   bucket: 'my-bucket',
 *   accessKeyId: 'LTAI...',
 *   secretAccessKey: '...',
 * })
 *
 * // ======== 腾讯云 COS ========
 * new StorageProvider({
 *   provider: 'tencent',
 *   region: 'ap-guangzhou',
 *   bucket: 'my-bucket-1250000000',
 *   accessKeyId: 'AKID...',
 *   secretAccessKey: '...',
 * })
 *
 * // ======== Cloudflare R2 ========
 * // R2 的 endpoint 包含 account_id，无法自动推断，必须显式传入
 * new StorageProvider({
 *   provider: 'cloudflare',
 *   endpoint: 'https://<account_id>.r2.cloudflarestorage.com',
 *   region: 'auto',
 *   bucket: 'my-bucket',
 *   accessKeyId: '...',
 *   secretAccessKey: '...',
 * })
 *
 * // ======== Backblaze B2 ========
 * new StorageProvider({
 *   provider: 'backblaze',
 *   region: 'us-west-002',
 *   bucket: 'my-bucket',
 *   accessKeyId: '...',
 *   secretAccessKey: '...',
 * })
 *
 * // ======== 本地存储 ========
 * new StorageProvider({
 *   provider: 'local',
 *   localDir: '/data/uploads',       // 可选，默认 process.cwd()/uploads
 * })
 * ```
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, dirname, resolve, sep } from 'node:path';

export interface StorageConfig {
  /** 存储平台 */
  provider: 'local' | 'aliyun' | 'tencent' | 'cloudflare' | 'backblaze';
  /** S3 endpoint（provider 为 aliyun/tencent/backblaze 时可省略，会自动推断） */
  endpoint?: string;
  /** 区域（默认 auto） */
  region?: string;
  /** 存储桶名称（S3 平台必填） */
  bucket?: string;
  /** 访问密钥 ID（S3 平台必填） */
  accessKeyId?: string;
  /** 访问密钥 Secret（S3 平台必填） */
  secretAccessKey?: string;
  /** 本地存储根目录（仅 provider=local 时生效，默认 process.cwd()/uploads） */
  localDir?: string;
  /** 公开访问域名（可选，覆盖默认 S3 endpoint 拼接的 URL） */
  publicDomain?: string;
}

/** 各平台 endpoint 自动推断规则 */
const PROVIDER_ENDPOINT_RULES: Record<
  string,
  (region: string) => string | null
> = {
  aliyun: (region) => `https://oss-${region}.aliyuncs.com`,
  tencent: (region) => `https://cos.${region}.myqcloud.com`,
  cloudflare: () => null, // R2 必须由用户提供 endpoint
  backblaze: (region) => `https://s3.${region}.backblazeb2.com`,
};

export class StorageProvider {
  private client: S3Client | null = null;
  private readonly config: StorageConfig;
  /** 实际解析后的 endpoint */
  private resolvedEndpoint: string = '';

  constructor(config: StorageConfig) {
    this.config = { ...config };

    if (config.provider !== 'local') {
      this.initS3Client();
    }
  }

  // ──────────────── 公开方法 ────────────────

  /**
   * 上传文件
   * @param file   文件二进制内容
   * @param key    对象键（路径，如 `images/foo.jpg`）
   * @param contentType MIME 类型（可选）
   * @returns 可访问的完整 URL
   */
  async upload(
    file: Buffer,
    key: string,
    contentType?: string,
  ): Promise<string> {
    if (this.config.provider === 'local') {
      return this.uploadLocal(file, key);
    }
    return this.uploadS3(file, key, contentType);
  }

  /**
   * 删除文件
   * @param key 对象键（路径）
   */
  async delete(key: string): Promise<void> {
    if (this.config.provider === 'local') {
      return this.deleteLocal(key);
    }
    return this.deleteS3(key);
  }

  /**
   * 签发 presigned PUT URL（供前端直传 R2 使用）
   *
   * 浏览器拿到这个 URL 后，可直接用 XHR PUT 上传文件，绕过后端中转。
   * R2/S3 兼容协议下，Content-Type/Content-Length 会被纳入签名校验，
   * 前端 PUT 时必须带上相同的头，否则会 403 SignatureDoesNotMatch。
   *
   * @param key         对象键
   * @param contentType MIME 类型（可选，签入签名）
   * @param size        文件大小（可选，签入签名，前端 PUT 时必须带 Content-Length）
   * @param expiresInSec URL 有效期（默认 5 分钟）
   */
  async presignPut(
    key: string,
    contentType?: string,
    size?: number,
    expiresInSec = 300,
  ): Promise<string> {
    if (this.config.provider === 'local') {
      throw new Error('[StorageProvider] presign 仅支持 S3 兼容云存储，不支持本地');
    }
    const client = this.getClient();

    // ⚠️ 不签 ContentLength / ContentType 到签名头里。
    // 原因：presigned URL 一旦把 content-length 签进去，浏览器 PUT 时
    // Content-Length 必须与签名时严格相等，否则 R2 返回 403
    // SignatureDoesNotMatch。但浏览器实际发送的 Content-Length 由
    // 浏览器内部根据请求体决定，难以保证精确匹配（特别是经过任何
    // transformation 时）。所以 presigned URL 只签 host，让 R2 只校验
    // 签名本身 + 过期时间。文件大小完整性由 confirm 阶段的 HEAD
    // + size 比对覆盖（更可靠）。
    void size; // 显式忽略，保留参数签名以兼容调用方
    void contentType;
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      // 故意不传 ContentType / ContentLength
    });

    // ⚠️ 不要对返回的 URL 做任何字符串修改（包括删除 checksum query 参数）。
    // 签名是基于完整 query 字符串计算的，任何字符改动都会让签名失效。
    // checksum 等参数虽不参与 HMAC，但属于 URL 的一部分，必须原样保留。
    return getSignedUrl(client, command, { expiresIn: expiresInSec });
  }

  /**
   * 签发 presigned GET URL（供后台下载备份等私有文件）
   * @param key          对象键
   * @param expiresInSec URL 有效期（默认 5 分钟）
   */
  async presignGet(key: string, expiresInSec = 300): Promise<string> {
    if (this.config.provider === 'local') {
      throw new Error('[StorageProvider] presignGet 仅支持 S3 兼容云存储');
    }
    const client = this.getClient();
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });
    return getSignedUrl(client, command, { expiresIn: expiresInSec });
  }

  /**
   * 探测存储桶连通性/权限（HEAD Bucket）—— 设置面板"测试连通性"用。
   * 验证 endpoint + 凭证 + 桶名三者同时正确（任一错误都会在这里暴露）。
   * 不抛错：把失败原因分类返回，让前端能展示人话。
   */
  async headBucket(): Promise<{
    ok: boolean;
    message: string;
  }> {
    if (this.config.provider === 'local') {
      return { ok: false, message: '本地存储无需测试连通性' };
    }
    const client = this.getClient();
    try {
      await client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
      );
      return { ok: true, message: '连接成功，凭证与存储桶均有效' };
    } catch (err) {
      const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
      const status = e.$metadata?.httpStatusCode;
      const name = e.name ?? '';
      if (name === 'NoSuchBucket' || status === 404) {
        return { ok: false, message: `存储桶「${this.config.bucket}」不存在，请检查桶名` };
      }
      if (status === 403 || name === 'AccessDenied' || name === 'SignatureDoesNotMatch') {
        if (name === 'SignatureDoesNotMatch') {
          return { ok: false, message: '签名不匹配：Access Key 或 Secret Key 错误' };
        }
        return { ok: false, message: '无权限访问该桶：凭证错误或该 Key 无此桶权限' };
      }
      if (name === 'ENOTFOUND' || name === 'ECONNREFUSED' || name === 'TimeoutError' || (e.message ?? '').includes('getaddrinfo')) {
        return { ok: false, message: `无法连接 ${this.resolvedEndpoint}：请检查 Endpoint / Account ID` };
      }
      return {
        ok: false,
        message: `连接失败（${status ?? name}）：${(e.message ?? '未知错误').slice(0, 120)}`,
      };
    }
  }

  /**
   * 探测对象是否存在（HEAD）—— 用于 confirm 阶段校验文件真已上传
   * @returns 存在则返回 { exists: true, size, contentType }；不存在返回 { exists: false }
   */
  async headObject(
    key: string,
  ): Promise<{ exists: boolean; size?: number; contentType?: string }> {
    if (this.config.provider === 'local') {
      throw new Error('[StorageProvider] headObject 仅支持 S3 兼容云存储');
    }
    const client = this.getClient();

    try {
      const res = await client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return {
        exists: true,
        size: typeof res.ContentLength === 'number' ? res.ContentLength : undefined,
        // R2/S3 的 ContentType 在 PUT 时由客户端设置，HEAD 可回读用于二次校验
        contentType: res.ContentType,
      };
    } catch (err) {
      const code = (err as { name?: string }).name;
      // 对象不存在
      if (code === 'NotFound' || code === '404') {
        return { exists: false };
      }
      throw new Error(
        `[StorageProvider] HEAD 失败: ${key} — ${(err as Error).message}`,
      );
    }
  }

  /**
   * 获取文件访问 URL（不含域名前缀，本地返回相对路径）
   * @param key 对象键（路径）
   */
  getUrl(key: string): string {
    if (this.config.provider === 'local') {
      return `/uploads/${key}`;
    }
    // 如果配置了公开域名（如 R2 的 oss.bitle.us.ci），优先使用
    if (this.config.publicDomain) {
      const base = this.config.publicDomain.replace(/\/+$/, '');
      return `${base}/${key}`;
    }
    // S3: {endpoint}/{bucket}/{key}
    const base = this.resolvedEndpoint.replace(/\/+$/, '');
    return `${base}/${this.config.bucket}/${key}`;
  }

  // ──────────────── 私有：S3 初始化 ────────────────

  private initS3Client(): void {
    const { provider, region, endpoint, accessKeyId, secretAccessKey } =
      this.config;

    // 自动推断 endpoint
    let resolvedEndpoint = (endpoint || '').trim();
    if (!resolvedEndpoint) {
      const rule = PROVIDER_ENDPOINT_RULES[provider];
      if (rule) {
        resolvedEndpoint = rule(region ?? 'auto') ?? '';
      }
    }

    if (!resolvedEndpoint) {
      const hints: Record<string, string> = {
        aliyun: 'https://oss-{region}.aliyuncs.com',
        tencent: 'https://cos.{region}.myqcloud.com',
        cloudflare: 'https://{account_id}.r2.cloudflarestorage.com',
        backblaze: 'https://s3.{region}.backblazeb2.com',
      };
      throw new Error(
        `[StorageProvider] ${provider} 需要提供 endpoint，` +
          `格式参考：${hints[provider] ?? 'https://...'}`,
      );
    }

    this.resolvedEndpoint = resolvedEndpoint;

    this.client = new S3Client({
      endpoint: resolvedEndpoint,
      region: region ?? 'auto',
      credentials: {
        accessKeyId: accessKeyId ?? '',
        secretAccessKey: secretAccessKey ?? '',
      },
      // path-style 兼容所有 S3 提供商（部分云平台不支持 virtual-hosted style）
      forcePathStyle: true,
    });
  }

  // ──────────────── 私有：Local 实现 ────────────────

  private async uploadLocal(file: Buffer, key: string): Promise<string> {
    const localDir = this.config.localDir ?? join(process.cwd(), 'uploads');
    const filePath = join(localDir, key);
    // 路径穿越防护：resolve 规范化后，filePath 必须严格在 localDir 子目录内。
    // 用 startsWith(localDir + sep) 避免 /app/uploads 被 /app/uploads-evil 前缀绕过。
    const resolved = resolve(filePath);
    const safePrefix = resolve(localDir) + sep;
    if (resolved === resolve(localDir) || !resolved.startsWith(safePrefix)) {
      throw new Error(`[StorageProvider] 非法路径: ${key}`);
    }

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, file);
    } catch (err) {
      throw new Error(
        `[StorageProvider] 本地文件写入失败: ${key} — ${(err as Error).message}`,
      );
    }

    return this.getUrl(key);
  }

  private async deleteLocal(key: string): Promise<void> {
    const localDir = this.config.localDir ?? join(process.cwd(), 'uploads');
    const filePath = join(localDir, key);
    // 路径穿越防护（同 uploadLocal）：resolve 后必须严格在 localDir 子目录内
    const safeDir = resolve(localDir) + sep;
    if (resolve(filePath) === resolve(localDir) || !resolve(filePath).startsWith(safeDir)) {
      throw new Error(`[StorageProvider] 非法路径: ${key}`);
    }

    try {
      await unlink(filePath);
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      // 文件不存在视为删除成功
      if (nodeErr.code === 'ENOENT') return;
      throw new Error(
        `[StorageProvider] 本地文件删除失败: ${key} — ${nodeErr.message}`,
      );
    }
  }

  // ──────────────── 私有：S3 实现 ────────────────

  private async uploadS3(
    file: Buffer,
    key: string,
    contentType?: string,
  ): Promise<string> {
    const client = this.getClient();

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: file,
      ...(contentType ? { ContentType: contentType } : {}),
    });

    try {
      await client.send(command);
    } catch (err) {
      throw new Error(
        `[StorageProvider] S3 上传失败: ${key}` +
          ` — bucket: ${this.config.bucket}` +
          `, endpoint: ${this.resolvedEndpoint}` +
          `, 错误: ${(err as Error).message}`,
      );
    }

    return this.getUrl(key);
  }

  private async deleteS3(key: string): Promise<void> {
    const client = this.getClient();

    const command = new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });

    try {
      await client.send(command);
    } catch (err) {
      throw new Error(
        `[StorageProvider] S3 删除失败: ${key}` +
          ` — bucket: ${this.config.bucket}` +
          `, 错误: ${(err as Error).message}`,
      );
    }
  }

  private getClient(): S3Client {
    if (!this.client) {
      throw new Error('[StorageProvider] S3 客户端未初始化，请检查配置');
    }
    return this.client;
  }
}

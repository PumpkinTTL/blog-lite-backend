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

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

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
}

/** 各平台 endpoint 自动推断规则 */
const PROVIDER_ENDPOINT_RULES: Record<string, (region: string) => string | null> = {
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
  async upload(file: Buffer, key: string, contentType?: string): Promise<string> {
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
   * 获取文件访问 URL（不含域名前缀，本地返回相对路径）
   * @param key 对象键（路径）
   */
  getUrl(key: string): string {
    if (this.config.provider === 'local') {
      return `/uploads/${key}`;
    }
    // S3: {endpoint}/{bucket}/{key}
    const base = this.resolvedEndpoint.replace(/\/+$/, '');
    return `${base}/${this.config.bucket}/${key}`;
  }

  // ──────────────── 私有：S3 初始化 ────────────────

  private initS3Client(): void {
    const { provider, region, endpoint, accessKeyId, secretAccessKey } = this.config;

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

  private async uploadS3(file: Buffer, key: string, contentType?: string): Promise<string> {
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

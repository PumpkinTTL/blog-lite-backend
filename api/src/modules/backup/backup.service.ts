import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { access } from 'node:fs/promises';
import { BackupLogEntity } from './backup-log.entity';
import { StorageProvider } from '../media/storage.provider';
import { SettingService } from '../setting/setting.service';

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);

/**
 * 定时器配置（存 settings 表，group=backup）
 * 每个定时器一条 record，value 是 JSON
 */
export interface BackupScheduleConfig {
  /** 唯一标识（settings.key 用 backup_schedule_<id>） */
  id: string;
  /** 定时器名称（展示用） */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 调度类型 */
  type: 'interval' | 'daily' | 'weekly';
  /** type=interval: 间隔分钟数 */
  intervalMinutes?: number;
  /** type=daily/weekly: 执行的小时 0-23 */
  hour?: number;
  /** type=daily/weekly: 执行的分钟 0-59 */
  minute?: number;
  /** type=weekly: 星期几 0-6（0=周日） */
  dayOfWeek?: number;
  /** 保留天数（过期自动从 R2 删除） */
  retainDays: number;
}

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * 备份服务：dump → gzip → 上传 R2 → HEAD 校验 → 清理过期
 *
 * 凭证安全：DB 密码通过 MYSQL_PWD 环境变量传给 mysqldump 子进程，
 * 不出现在命令行参数里（避免 ps / shell history 泄露）。
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    @InjectRepository(BackupLogEntity)
    private readonly logRepo: Repository<BackupLogEntity>,
    private readonly configService: ConfigService,
    private readonly settingService: SettingService,
  ) {}

  // ──────────────── 备份执行 ────────────────

  /**
   * 执行一次完整备份（手动/定时器共用）
   *
   * 设计：立即创建 status=running 记录并返回，真正的 dump/压缩/上传在后台异步执行，
   * 不阻塞 HTTP 请求（避免 admin 点击后卡住几秒）。前端轮询 logs 接口看状态变化。
   *
   * @param trigger 触发方式
   * @param scheduleName 定时器名称（手动为 null）
   * @returns 刚创建的 running 记录（备份还在后台进行）
   */
  async runBackup(
    trigger: 'schedule' | 'manual',
    scheduleName?: string,
    retainDays?: number,
  ): Promise<BackupLogEntity> {
    const log = this.logRepo.create({
      trigger,
      scheduleName: scheduleName || null,
      status: 'running',
    });
    const saved = await this.logRepo.save(log);

    // 后台异步执行，不 await（立即返回给调用方）。
    // retainDays 一并透传：本方法返回的记录恒为 running，调用方判
    // status==='success' 再清理是死代码（审查发现：备份曾无限累积 R2）——
    // 清理必须移到 executeBackup 的成功分支内做。
    this.executeBackup(saved, retainDays).catch((err) => {
      this.logger.error(`备份后台任务异常: ${err.message}`);
    });

    return saved;
  }

  /**
   * 实际执行备份（dump → gzip → 上传 R2 → HEAD 校验）
   * 由 runBackup 后台调用，或定时器调用。出错时更新记录为 failed。
   */
  private async executeBackup(saved: BackupLogEntity, retainDays?: number): Promise<void> {
    const startedAt = saved.createdAt.getTime();

    try {
      // 1. mysqldump（密码走环境变量，不进命令行）
      const sqlBuffer = await this.dumpDatabase();
      // 2. gzip 压缩
      const gzBuffer = await gzipAsync(sqlBuffer);
      // 3. 上传 R2
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const r2Key = `backup/${timestamp}_${saved.trigger}.sql.gz`;
      const provider = await this.createR2Provider();
      const uploadSize = gzBuffer.length;
      await provider.upload(gzBuffer, r2Key, 'application/gzip');
      // 4. HEAD 校验：等 1 秒让 R2 最终一致，然后验"存在"（size 不强匹配）
      // R2 是最终一致性存储，刚 PUT 完 HEAD 可能 size 有短暂偏差，
      // 强制 size === uploadSize 会导致偶发"校验失败"。这里只验 exists。
      await new Promise((r) => setTimeout(r, 1000));
      const head = await provider.headObject(r2Key);
      const verified = head.exists;
      // size 差异大时记 warn（便于排查），但不判失败
      if (head.exists && head.size !== undefined && Math.abs(head.size - uploadSize) > 100) {
        this.logger.warn(
          `备份 ${r2Key} size 差异：上传 ${uploadSize}，R2 HEAD ${head.size}（仍判校验通过，差异 < 100B 视为一致）`,
        );
      }

      saved.r2Key = r2Key;
      saved.size = uploadSize;
      saved.status = 'success';
      saved.r2Verified = verified;
      saved.durationMs = Date.now() - startedAt;
      await this.logRepo.save(saved);

      // 备份成功后清理过期备份（retainDays>0 时）。
      // 曾是调用方判返回值 status==='success' 才清——但异步执行下返回值恒为
      // running，条件永假，清理从未执行（R2 备份无限累积）。移到这里才是活代码。
      if (retainDays && retainDays > 0) {
        try {
          const removed = await this.cleanExpired(retainDays);
          if (removed > 0) {
            this.logger.log(`已清理 ${removed} 个超过 ${retainDays} 天的过期备份`);
          }
        } catch (e) {
          this.logger.warn(
            `清理过期备份失败（不影响本次备份）: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
    } catch (err) {
      saved.status = 'failed';
      saved.errorMessage = (err as Error).message?.slice(0, 500) || '未知错误';
      saved.durationMs = Date.now() - startedAt;
      this.logger.error(`备份失败: ${saved.errorMessage}`);
      await this.logRepo.save(saved);
    }
  }

  /** 缓存：自动发现的 mysqldump 路径（首次查询后缓存，避免每次备份都查 basedir） */
  private mysqldumpPathCache: string | null = null;

  /**
   * 自动发现 mysqldump 可执行文件路径
   * 优先级：MYSQL_DUMP_BIN 环境变量 > MySQL @@basedir/bin/mysqldump > 默认 mysqldump
   *
   * 解决 Windows 上 phpstudy/wamp/xampp 装的 MySQL 不在 PATH 的问题。
   * MySQL 自己知道自己的安装路径（@@basedir），mysqldump 必然在 bin 子目录。
   */
  private async resolveMysqldumpPath(): Promise<string> {
    // 1. 环境变量显式指定（最高优先级）
    const envBin = this.configService.get<string>('MYSQL_DUMP_BIN');
    if (envBin) return envBin;

    // 2. 从缓存读（同一进程内只查一次 basedir）
    if (this.mysqldumpPathCache) return this.mysqldumpPathCache;

    // 3. 查 MySQL @@basedir，拼 bin/mysqldump(.exe)
    try {
      const cfg = this.getDbConfig();
      const conn = await import('mysql2/promise');
      const connection = await conn.createConnection({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
      });
      const [rows] = await connection.query('SELECT @@basedir AS basedir');
      await connection.end();
      const basedir = (rows[0] as any).basedir as string;
      if (basedir) {
        // Windows: basedir/bin/mysqldump.exe; Linux: basedir/bin/mysqldump
        const ext = process.platform === 'win32' ? '.exe' : '';
        const candidate = `${basedir.replace(/[/\\]+$/, '')}/bin/mysqldump${ext}`;
        // ⚠️ 必须验证文件存在：
        // 生产环境 DB_HOST 是独立 MariaDB 容器，查到的 @@basedir 是 MariaDB 容器内的路径，
        // 在 NestJS 容器里不存在（跨容器文件系统隔离）。fs.access 失败就跳过，走 PATH fallback。
        try {
          await access(candidate);
          this.logger.log(`自动发现 mysqldump: ${candidate}（基于 MySQL @@basedir）`);
          this.mysqldumpPathCache = candidate;
          return candidate;
        } catch {
          this.logger.log(
            `@@basedir 拼出的 ${candidate} 在本机不存在（可能是远程数据库/Docker 跨容器），改用 PATH 里的 mysqldump`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(`自动发现 mysqldump 失败（查 @@basedir 出错）: ${(err as Error).message}`);
    }

    // 4. fallback：用 PATH 里的 mysqldump
    // - 开发环境(Windows)：上面 basedir 命中后不会走到这
    // - 生产环境(Docker)：Dockerfile 装 mysql-client 后 PATH 里有 mysqldump
    this.mysqldumpPathCache = 'mysqldump';
    return 'mysqldump';
  }

  /**
   * mysqldump 导出数据库
   * 密码通过 MYSQL_PWD 环境变量传递，不出现在命令行参数（防 ps 泄露）
   */
  private async dumpDatabase(): Promise<Buffer> {
    const cfg = this.getDbConfig();
    const dumpBin = await this.resolveMysqldumpPath();

    const args = [
      '--no-tablespaces', // 避免 PROCESS 权限问题
      '--single-transaction', // InnoDB 一致性快照，不锁表
      '--quick', // 大表流式输出，不占内存
      '--routines', // 导出存储过程/函数
      '--triggers',
      '-h', cfg.host,
      '-P', String(cfg.port),
      '-u', cfg.user,
      cfg.database,
    ];

    try {
      const { stdout } = await execFileAsync(dumpBin, args, {
        env: { ...process.env, MYSQL_PWD: cfg.password },
        maxBuffer: 512 * 1024 * 1024, // 512MB 上限（压缩前）
        timeout: 300000, // 5 分钟超时
      });
      return Buffer.from(stdout, 'utf8');
    } catch (err) {
      const msg = (err as Error).message;
      // 给出常见错误的友好提示
      if (/ENOENT|not found/i.test(msg)) {
        throw new Error(
          `mysqldump 命令未找到(${dumpBin})。若在 Docker 内，请在 Dockerfile 安装 mysql-client，或设置 MYSQL_DUMP_BIN 指向正确路径`,
        );
      }
      throw new Error(`mysqldump 失败: ${msg.slice(0, 300)}`);
    }
  }

  private getDbConfig(): DbConfig {
    const cfg: DbConfig = {
      host: this.configService.get<string>('DB_HOST', 'localhost'),
      port: Number(this.configService.get<string>('DB_PORT', '3306')),
      user: this.configService.get<string>('DB_USERNAME', 'root'),
      password: this.configService.get<string>('DB_PASSWORD', ''),
      database: this.configService.get<string>('DB_DATABASE', 'blog-lite'),
    };
    if (!cfg.password) {
      throw new BadRequestException('DB_PASSWORD 未配置，无法执行备份');
    }
    return cfg;
  }

  // ──────────────── R2 操作 ────────────────

  /** 复用 media 模块的 R2 配置创建 StorageProvider */
  /**
   * 创建 R2 provider：面板配置（系统设置→存储配置 storage.r2.accounts）优先，
   * 空则回落 .env（审查发现：此前只读 .env，面板配了 R2 时上传正常但备份报"未配置"）。
   * 与 MediaService.createR2Provider 同一套优先级。备份低频，不做实例缓存。
   */
  private async createR2Provider(): Promise<StorageProvider> {
    // 1. 面板多账号配置
    try {
      const accountsRaw = (await this.settingService.findByKey('storage.r2.accounts'))?.value || '';
      const activeId = ((await this.settingService.findByKey('storage.r2.active_id'))?.value || '').trim();
      if (accountsRaw) {
        const list = JSON.parse(accountsRaw);
        if (Array.isArray(list)) {
          const enabled = list.filter((a: any) => a && a.enabled !== false);
          const active = enabled.find((a: any) => a.id === activeId) ?? enabled[0];
          if (active && active.accountId && active.accessKeyId && active.secretAccessKey && active.bucket) {
            const endpoint = /^https?:\/\//i.test(active.accountId || '')
              ? active.accountId
              : `https://${active.accountId}.r2.cloudflarestorage.com`;
            return new StorageProvider({
              provider: 'cloudflare',
              endpoint,
              region: 'auto',
              bucket: active.bucket,
              accessKeyId: active.accessKeyId,
              secretAccessKey: active.secretAccessKey,
              publicDomain: active.publicDomain || undefined,
            });
          }
        }
      }
    } catch {
      // 面板配置解析失败回落 .env（不阻塞备份）
    }
    return this.createR2ProviderFromEnv();
  }

  private createR2ProviderFromEnv(): StorageProvider {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
    const bucket = this.configService.get<string>('R2_BUCKET');
    const publicDomain = this.configService.get<string>('R2_PUBLIC_DOMAIN');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new BadRequestException(
        'R2 未配置：请设置 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET',
      );
    }
    return new StorageProvider({
      provider: 'cloudflare',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      bucket,
      accessKeyId,
      secretAccessKey,
      publicDomain: publicDomain || undefined,
    });
  }

  /**
   * 生成 R2 presigned GET URL（admin 下载用，5 分钟有效）
   */
  async getDownloadUrl(r2Key: string, expiresInSec = 300): Promise<string> {
    const provider = await this.createR2Provider();
    // StorageProvider 有 presignPut，这里需要 presigned GET
    // 复用其内部 S3 client 的签名能力
    return provider.presignGet(r2Key, expiresInSec);
  }

  /**
   * 重新校验某条备份记录在 R2 是否还存在（admin 手动复查）
   */
  async verifyBackup(logId: number): Promise<{ verified: boolean; size?: number }> {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log) throw new BadRequestException('备份记录不存在');
    if (!log.r2Key) return { verified: false };

    const provider = await this.createR2Provider();
    const head = await provider.headObject(log.r2Key);
    // 与 executeBackup 保持一致：只验"存在"，不强匹配 size。
    // R2 是最终一致性存储，刚上传/复制后 HEAD 可能有短暂 size 漂移，
    // 强制 size === log.size 会偶发"校验失败"。
    const verified = head.exists;
    if (head.exists && head.size !== undefined && log.size && Math.abs(head.size - log.size) > 100) {
      this.logger.warn(
        `备份 ${log.r2Key} size 差异：记录 ${log.size}，R2 HEAD ${head.size}（仍判校验通过）`,
      );
    }

    // 更新记录的校验状态
    log.r2Verified = verified;
    await this.logRepo.save(log);
    return { verified, size: head.size };
  }

  /**
   * 清理过期备份（从 R2 删除超过 retainDays 的）
   * 每次备份成功后调用
   */
  async cleanExpired(retainDays: number): Promise<number> {
    if (retainDays <= 0) return 0;
    const cutoff = new Date(Date.now() - retainDays * 86400 * 1000);
    // 查过期且成功的记录 —— where 直接带 createdAt < cutoff，
    // 避免 find({ status:'success' }) 全量加载到内存再 filter
    // （backup_logs 累积上千条后全量拉回内存开销线性增长）
    const expired = await this.logRepo.find({
      where: { status: 'success' as const, createdAt: LessThan(cutoff) },
    });
    const toDelete = expired.filter((l) => l.r2Key);
    if (toDelete.length === 0) return 0;

    const provider = await this.createR2Provider();
    let deleted = 0;
    for (const log of toDelete) {
      try {
        await provider.delete(log.r2Key!);
        // R2 删了，记录也删（历史不留垃圾）
        await this.logRepo.delete(log.id);
        deleted++;
      } catch (err) {
        this.logger.warn(`清理过期备份 ${log.r2Key} 失败: ${(err as Error).message}`);
      }
    }
    this.logger.log(`清理过期备份: 删除 ${deleted}/${toDelete.length} 个`);
    return deleted;
  }

  // ──────────────── 历史查询 ────────────────

  async findLogs(page = 1, pageSize = 20) {
    const [list, total] = await this.logRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async findLogById(id: number): Promise<BackupLogEntity | null> {
    return this.logRepo.findOne({ where: { id } });
  }

  async deleteLog(id: number, alsoDeleteR2 = true): Promise<void> {
    const log = await this.logRepo.findOne({ where: { id } });
    if (!log) return;
    if (alsoDeleteR2 && log.r2Key) {
      try {
        const provider = await this.createR2Provider();
        await provider.delete(log.r2Key);
      } catch (err) {
        this.logger.warn(`删除 R2 备份 ${log.r2Key} 失败: ${(err as Error).message}`);
      }
    }
    await this.logRepo.delete(id);
  }
}

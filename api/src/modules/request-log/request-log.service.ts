import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestLogEntity } from './request-log.entity';

/** 单条请求日志（内存缓冲结构，落库前临时持有） */
export interface RequestLogEntry {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip: string;
  userId: number | null;
  errorMessage: string | null;
}

/** 批量刷盘阈值：buffer 满此数立即落库 */
const FLUSH_BATCH = 100;
/** 定时刷盘间隔：即使没攒满也定时落库（ms） */
const FLUSH_INTERVAL_MS = 10_000;

/**
 * 请求日志服务 —— 内存缓冲 + 批量落库。
 *
 * 设计动机：每个请求直接写库 = 每请求一次 INSERT，高并发下 DB 连接被请求日志拖垮。
 * 改为内存缓冲：请求结束时 push 到 buffer（零阻塞纯内存），
 * 攒满 FLUSH_BATCH 条 或 FLUSH_INTERVAL_MS 到期 才批量 INSERT（一次插入 N 条，DB 压力降 N 倍）。
 *
 * 数据安全：进程正常退出时（onModuleDestroy）最后刷一次；
 * 异常崩溃可能丢失缓冲区未刷部分（最多 FLUSH_INTERVAL_MS 的数据），日志非财务数据可接受。
 */
@Injectable()
export class RequestLogService implements OnModuleDestroy {
  private readonly logger = new Logger(RequestLogService.name);
  private buffer: RequestLogEntity[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(RequestLogEntity)
    private readonly repo: Repository<RequestLogEntity>,
  ) {
    // 启动定时刷盘
    this.timer = setInterval(() => {
      this.flush().catch((e) =>
        this.logger.error(`定时刷盘失败: ${(e as Error).message}`),
      );
    }, FLUSH_INTERVAL_MS);
    // setInterval 不阻止进程退出，无需 unref
  }

  /**
   * 记录一条请求日志（写入内存缓冲，不阻塞响应）。
   * 由请求日志中间件在 res.on('finish') 时调用。
   */
  log(entry: RequestLogEntry): void {
    this.buffer.push(this.repo.create(entry));
    if (this.buffer.length >= FLUSH_BATCH) {
      // 攒满立即刷（异步，不阻塞当前请求）
      this.flush().catch((e) =>
        this.logger.error(`批量刷盘失败: ${(e as Error).message}`),
      );
    }
  }

  /**
   * 批量落库（把 buffer 的数据一次性 INSERT，然后清空）。
   * 用局部变量交换避免并发：取出 buffer 引用 → 置空 → 异步写。
   * flush 期间新进来的请求会进新 buffer，不会丢失也不会重复写。
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    try {
      await this.repo.save(batch);
    } catch (e) {
      // 落库失败：数据放回 buffer 头部，等下次重试（避免丢失）
      this.buffer.unshift(...batch);
      this.logger.error(
        `请求日志落库失败（${batch.length} 条已放回缓冲，下次重试）: ${(e as Error).message}`,
      );
    }
  }

  /** 查询请求日志（admin 后台用） */
  async findAll(params: {
    page: number;
    pageSize: number;
    requestId?: string;
    ip?: string;
    status?: number;
    method?: string;
    userId?: number;
    startTime?: Date;
    endTime?: Date;
  }) {
    const qb = this.repo.createQueryBuilder('e');

    if (params.requestId) {
      qb.andWhere('e.requestId = :requestId', { requestId: params.requestId });
    }
    if (params.ip) {
      qb.andWhere('e.ip = :ip', { ip: params.ip });
    }
    if (params.status) {
      // 支持按状态码前缀筛选（如传 4 查所有 4xx，传 5 查所有 5xx）
      if (params.status < 10) {
        const lo = params.status * 100;
        const hi = lo + 99;
        qb.andWhere('e.status BETWEEN :lo AND :hi', { lo, hi });
      } else {
        qb.andWhere('e.status = :status', { status: params.status });
      }
    }
    if (params.method) {
      qb.andWhere('e.method = :method', { method: params.method });
    }
    if (params.userId) {
      qb.andWhere('e.userId = :userId', { userId: params.userId });
    }
    if (params.startTime) {
      qb.andWhere('e.createdAt >= :startTime', { startTime: params.startTime });
    }
    if (params.endTime) {
      qb.andWhere('e.createdAt <= :endTime', { endTime: params.endTime });
    }

    qb.orderBy('e.createdAt', 'DESC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page: params.page, pageSize: params.pageSize };
  }

  /** 按 requestId 精确查一条（用户报错时的追溯主入口） */
  async findByRequestId(requestId: string): Promise<RequestLogEntity | null> {
    return this.repo.findOne({ where: { requestId } });
  }

  /** 清理过期日志（按天数，admin 可配或定时跑） */
  async cleanExpired(retainDays: number): Promise<number> {
    if (retainDays <= 0) return 0;
    const cutoff = new Date(Date.now() - retainDays * 86400 * 1000);
    const result = await this.repo
      .createQueryBuilder('e')
      .delete()
      .where('e.createdAt < :cutoff', { cutoff })
      .execute();
    return result.affected || 0;
  }

  /** 进程退出时最后刷一次盘，尽量不丢 */
  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
    this.logger.log('请求日志缓冲已刷盘，进程退出');
  }
}

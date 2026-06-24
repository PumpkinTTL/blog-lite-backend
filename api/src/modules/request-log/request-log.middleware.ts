import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { RequestLogService } from './request-log.service';
import { getClientIp } from '../../common/utils/get-client-ip';

/**
 * 请求日志中间件 —— 在请求结束时记录一条日志到缓冲区。
 *
 * 时机：res.on('finish') 触发时（响应已发完），此时 status 已确定。
 * 性能：只做内存 push（RequestLogService.log），不阻塞响应。
 *       实际落库由 service 的批量刷盘负责。
 *
 * 记录内容：requestId / method / path / status / 耗时 / IP / userId / 错误信息。
 * 错误信息仅 4xx/5xx 记录（成功请求 errorMessage=null）。
 */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  constructor(private readonly requestLogService: RequestLogService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();

    res.on('finish', () => {
      // 跳过健康检查/静态资源等无意义请求，减少噪声
      const path = req.path;
      if (path === '/' || path.startsWith('/uploads/')) return;

      const status = res.statusCode;
      // 错误信息：4xx/5xx 才记录（从 res.locals 取异常过滤器塞的错误消息）
      let errorMessage: string | null = null;
      if (status >= 400) {
        errorMessage = (res.locals as any)?.errorMessage || null;
      }

      this.requestLogService.log({
        requestId: (req as any).reqId || (req as any).id || 'unknown',
        method: req.method,
        path,
        status,
        durationMs: Date.now() - startTime,
        ip: getClientIp(req),
        userId: (req as any).user?.sub ?? null,
        errorMessage,
      });
    });

    next();
  }
}

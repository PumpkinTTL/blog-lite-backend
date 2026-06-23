import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * 请求追溯中间件（业界标准 X-Request-Id 方案）。
 *
 * 关键：ID 生成由 pino-http 的 genReqId 统一负责（它在请求最早期执行）。
 * 本中间件只做两件事：
 * 1. 把 pino 生成的 req.id 同步到 req.reqId（供 Guard/Service/Filter 用语义化字段读取）
 * 2. 写入响应头 X-Request-Id 返回给前端
 *
 * 不在本中间件里生成 ID——避免与 pino genReqId 双重生成导致日志 reqId 与响应体
 * requestId 不一致（那样用户上报的 ID 在日志里查不到）。
 * 兜底：万一 pino 未先执行（req.id 为空），才用 crypto.randomUUID 生成，保证必有值。
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // pino-http 已通过 genReqId 生成并挂到 req.id；这里同步到语义化字段
    // 兜底：极端情况下 pino 未先执行，现场生成（与 genReqId 读同样的 header 逻辑）
    const reqId = (req as any).id || this.resolveId(req);

    (req as any).reqId = reqId;

    // 响应头返回（让前端能拿到，错误时展示追踪号）
    res.setHeader('X-Request-Id', reqId);

    next();
  }

  /** 与 app.module 的 genReqId 保持一致的头解析逻辑，确保兜底生成的 ID 也对齐 */
  private resolveId(req: Request): string {
    const incoming = req.headers['x-request-id'];
    if (typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128) {
      return incoming;
    }
    return crypto.randomUUID();
  }
}

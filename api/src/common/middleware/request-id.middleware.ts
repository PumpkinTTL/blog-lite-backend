import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * 请求追溯中间件（业界标准 X-Request-Id 方案）。
 *
 * 职责：
 * 1. 读取请求头 X-Request-Id；前端传了就用（便于跨端追溯），没传则生成（crypto.randomUUID）。
 * 2. 把 reqId 挂到 req.reqId / req.id，供后续所有中间件/Guard/Service/Filter 访问。
 * 3. 写入响应头 X-Request-Id 返回给前端，前端报错时可直接展示这个 ID 给用户上报。
 *
 * 与 pino-http 协同：pinoHttp 配置 genReqId 读同一个 header + req.reqId，
 * 这样每条日志的 reqId 字段与本中间件一致，日志和响应体能用同一个 ID 串联。
 *
 * 追溯闭环：
 *   前端生成 reqId → 带 X-Request-Id 请求 → 后端日志带 reqId → 响应头返回 reqId
 *   → 出错时响应体带 requestId → 用户上报 → 后端用 reqId grep 日志，定位完整行为链。
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // 优先用前端传入的（跨端追溯），否则后端生成
    const incoming = req.headers['x-request-id'] as string | undefined;
    const reqId =
      incoming && incoming.length <= 128
        ? incoming
        : crypto.randomUUID();

    // 挂到 req 上，供 Guard/Service/Filter 读取
    (req as any).reqId = reqId;
    (req as any).id = reqId; // pino-http 默认读 req.id

    // 响应头返回（即使前端没传，也把后端生成的返回，方便前端记录）
    res.setHeader('X-Request-Id', reqId);

    next();
  }
}

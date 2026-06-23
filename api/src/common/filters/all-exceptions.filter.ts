import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;

      // HttpException 只在开发环境打印堆栈到日志，不暴露给客户端
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(`HTTP ${status}: ${message}`);
      }
    } else if (exception instanceof Error) {
      // 非 HttpException 的原生错误（TypeORM 的 ER_DUP_ENTRY、SQL 错误、
      // 连接错误带主机名等）：完整 message 只记日志用于排障，
      // 对客户端只返回通用提示，避免泄露数据库结构/表名/SQL 片段/内部主机。
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
      // message 保持默认 '服务器内部错误'，不覆盖
    } else {
      this.logger.error('Unhandled exception', String(exception));
    }

    // 统一响应格式，与业务接口一致
    response.status(status).json({
      success: false,
      message: Array.isArray(message) ? message.join(', ') : message,
      data: null,
    });
  }
}

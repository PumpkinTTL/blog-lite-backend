import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestLogEntity } from './request-log.entity';
import { RequestLogService } from './request-log.service';
import { RequestLogMiddleware } from './request-log.middleware';
import { RequestLogController } from './request-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RequestLogEntity])],
  providers: [RequestLogService],
  controllers: [RequestLogController],
  exports: [RequestLogService],
})
export class RequestLogModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 全局注册请求日志中间件，在所有路由上生效
    consumer.apply(RequestLogMiddleware).forRoutes('*');
  }
}

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import * as crypto from 'crypto';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { RolesGuard } from './modules/auth/roles.guard';
import { RateLimitGuard } from './modules/rate-limit/rate-limit.guard';
import { RateLimitUserGuard } from './modules/rate-limit/rate-limit-user.guard';
import { BlacklistGuard } from './common/guards/blacklist.guard';
import { MaintenanceGuard } from './common/guards/maintenance.guard';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RedisModule } from './modules/redis/redis.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { TurnstileModule } from './modules/turnstile/turnstile.module';
import { TurnstileGuard } from './modules/turnstile/turnstile.guard';
import { UserModule } from './modules/user/user.module';
import { CodeModule } from './modules/code/code.module';
import { PostModule } from './modules/post/post.module';
import { CategoryModule } from './modules/category/category.module';
import { TagModule } from './modules/tag/tag.module';
import { MediaModule } from './modules/media/media.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AnnouncementModule } from './modules/announcement/announcement.module';
import { FriendLinkModule } from './modules/friend-link/friend-link.module';
import { SettingModule } from './modules/setting/setting.module';
import { DonationModule } from './modules/donation/donation.module';
import { PlanModule } from './modules/plan/plan.module';
import { MembershipModule } from './modules/membership/membership.module';
import { InteractionModule } from './modules/interaction/interaction.module';
import { CommentModule } from './modules/comment/comment.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { ResourceModule } from './modules/resource/resource.module';
import { ResourceCategoryModule } from './modules/resource-category/resource-category.module';
import { BlacklistModule } from './modules/blacklist/blacklist.module';
import { AiModule } from './modules/ai/ai.module';
import { AiProviderModule } from './modules/ai-provider/ai-provider.module';
import { AiConversationModule } from './modules/ai-conversation/ai-conversation.module';
import { AdModule } from './modules/ad/ad.module';
import { BackupModule } from './modules/backup/backup.module';
import { RequestLogModule } from './modules/request-log/request-log.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  providers: [
    // Guard 执行顺序（APP_GUARD 按声明顺序执行）：
    // 1. 黑名单 → 最先查，已封禁 IP 直接 403，不消耗限流额度/鉴权资源
    //    （应用层兜底；nginx 层未来做 deny 硬封禁更早拦截）
    // 2. IP限流 → 鉴权前，挡匿名洪水，违规累计自动拉黑
    // 3. Turnstile → 鉴权前，对标记了 @RequireTurnstile 的接口校验人机 token
    //    （放在限流后：先挡洪水再校验，避免消耗 Cloudflare 校验配额）
    // 4. 鉴权 → 校验 token，挂 req.user
    // 5. 维护模式 → 鉴权后，读 maintenance.enabled，admin 豁免，GET 放行，写操作 503
    //    （必须在 AuthGuard 后：需要 req.user.roles 判 admin）
    // 6. 用户限流 → 鉴权后，对已登录用户按 user id 限流（挡登录态刷接口）
    // 7. 角色 → 校验 @Roles('admin')
    {
      provide: APP_GUARD,
      useClass: BlacklistGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TurnstileGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MaintenanceGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitUserGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';

        return {
          pinoHttp: {
            // 审查P0：默认 std serializer 会把完整 req.headers（含 Bearer token/cookie）
            // 写进每条请求日志。显式 redact 掉敏感头。
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              censor: '[REDACTED]',
            },
            level:
              configService.get('LOG_LEVEL') ??
              (isProduction ? 'info' : 'debug'),
            // 【ID 唯一来源】genReqId 是 reqId 的唯一生成点（pino-http 在请求最早期执行）。
            // RequestIdMiddleware 不再生成，只把 req.id 同步到 req.reqId + 写响应头，
            // 保证日志 reqId、响应头 X-Request-Id、响应体 requestId 三者一致，
            // 用户上报任一个都能 grep 到对应日志。
            genReqId: (req: any) => {
              // 仅接受 UUID/十六进制格式（防伪造任意内容污染日志关联与 request_logs 表）
              const incoming = req.headers['x-request-id'];
              if (typeof incoming === 'string' && /^[0-9a-fA-F-]{8,64}$/.test(incoming)) {
                return incoming;
              }
              return crypto.randomUUID();
            },
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                  },
                },
          },
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.getOrThrow<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.getOrThrow<string>('DB_USERNAME'),
        password: configService.getOrThrow<string>('DB_PASSWORD'),
        database: configService.getOrThrow<string>('DB_DATABASE'),
        charset: 'utf8mb4',
        // 统一时区为 +08:00，确保 Node 端 new Date() 与 MySQL CURDATE()/DATETIME 一致，
        // 避免会员到期时间偏移、dashboard 趋势图日期分组错位。
        timezone: '+08:00',
        autoLoadEntities: true,
        // 生产环境绝不 synchronize：全量 schema 比对 DDL（含删列/改类型）会无确认直写。
        // 三道防线：① NODE_ENV=production 直接关 ② 生产+显式开 synchronize 时启动
        // fail-fast 拒绝启动（防配置漂移/误拷开发 .env）③ 上线清单核对 .env.production
        synchronize:
          configService.get('DB_SYNCHRONIZE') === 'true' &&
          configService.get('NODE_ENV') !== 'production',
        // 慢查询可见性：超过 1s 的查询打 error 日志（生产排障）
        maxQueryExecutionTime: 1000,
        retryAttempts: 3,
        retryDelay: 1000,
        // 连接池配置（mysql2 默认 connectionLimit:10，显式调优避免突发并发排队超时）
        extra: {
          connectionLimit: 20,
          waitForConnections: true,
          connectTimeout: 10000,
        },
      }),
    }),
    // Redis（限流计数，全局共享 ioredis 实例）
    RedisModule,
    // 限流模块（内存配置 + Guard + 配置接口，热更新）
    RateLimitModule,
    // Turnstile 人机验证（Guard 挂在登录/注册/发码接口）
    TurnstileModule,
    UserModule,
    CodeModule,
    AuthModule,
    PostModule,
    CategoryModule,
    TagModule,
    MediaModule,
    DashboardModule,
    AnnouncementModule,
    FriendLinkModule,
    SettingModule,
    DonationModule,
    PlanModule,
    MembershipModule,
    InteractionModule,
    CommentModule,
    AuditLogModule,
    ResourceModule,
    ResourceCategoryModule,
    BlacklistModule,
    AiModule,
    AiProviderModule,
    AiConversationModule,
    AdModule,
    // ScheduleModule 必须在 imports 注册一次 forRoot（backup 模块动态 cron 依赖它）
    ScheduleModule.forRoot(),
    BackupModule,
    RequestLogModule,
  ],
})
export class AppModule implements NestModule {
  // 注册请求追溯中间件（全局，所有路由）。
  // 必须在 Guard 之前执行——Guard/Service/Filter 都要读 req.reqId。
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

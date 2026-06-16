import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { RolesGuard } from './modules/auth/roles.guard';
import { RateLimitGuard } from './modules/rate-limit/rate-limit.guard';
import { BlacklistGuard } from './common/guards/blacklist.guard';
import { RedisModule } from './modules/redis/redis.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
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

@Module({
  providers: [
    // Guard 执行顺序（APP_GUARD 按声明顺序执行）：
    // 1. 限流 → 先挡洪水流量，阈值从内存配置读（GUI 可热更新）
    // 2. 鉴权 → 校验 token，挂 req.user
    // 3. 黑名单 → 读 req.user.sub + IP，命中封禁抛 403
    // 4. 角色 → 校验 @Roles('admin')
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: BlacklistGuard,
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
            level:
              configService.get('LOG_LEVEL') ??
              (isProduction ? 'info' : 'debug'),
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
        autoLoadEntities: true,
        synchronize:
          configService.get('DB_SYNCHRONIZE') === 'true' &&
          configService.get('NODE_ENV') !== 'production',
        retryAttempts: 3,
        retryDelay: 1000,
      }),
    }),
    // Redis（限流计数，全局共享 ioredis 实例）
    RedisModule,
    // 限流模块（内存配置 + Guard + 配置接口，热更新）
    RateLimitModule,
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
  ],
})
export class AppModule {}

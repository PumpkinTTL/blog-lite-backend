import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

const bootstrapLogger = new NestLogger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 5100);

  // 信任反向代理：nginx/CDN 后必须设置，否则 req.ip 恒为代理内网地址（如 127.0.0.1），
  // 导致限流/黑名单的 IP 维度全员串号、审计 IP 失真。
  // TRUST_PROXY 配置代理跳数（如 'loopback' / 数字 / 逗号分隔 IP 段），默认 loopback
  // （信任本机 nginx）。生产环境多级代理应配成实际跳数或代理 IP。
  app.set('trust proxy', configService.get<string>('TRUST_PROXY', 'loopback'));

  // 调高 JSON body 上限。Express 默认 100kb，AI 对话（长文 + 多轮历史）
  // 与富文本长文会轻松超过，触发 'request entity too large' (413)。
  // 用 NestExpressApplication.useBodyParser 覆盖默认 limit，
  // 可经 BODY_LIMIT 环境变量调整，默认 10mb。
  app.useBodyParser('json', {
    limit: configService.get<string>('BODY_LIMIT', '10mb'),
  });

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: configService
      .get<string>(
        'CORS_ORIGINS',
        'http://localhost:5173,http://localhost:5174',
      )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
    // 暴露 X-Request-Id 给前端 JS：跨域下未列入 exposedHeaders 的自定义响应头
    // 浏览器不暴露，前端 extractRequestId 读不到，追溯闭环失效
    exposedHeaders: ['X-Request-Id'],
  });

  // 安全 HTTP 响应头（等价 helmet 核心功能，无需额外依赖）。
  // 防止 MIME 嗅探、点击劫持（iframe 嵌套）、降级协议攻击等常见 Web 风险。
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // HSTS：仅 HTTPS 生效，强制浏览器后续走加密通道（生产 https 部署后启用）
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // 健康检查端点（Express 原生路由，不走 NestJS 守卫链，无需 @Public）。
  // 供 LB/K8s/容器编排探针使用；进程能响应即视为存活。
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  await app.listen(port);

  const url = await app.getUrl();
  bootstrapLogger.log(`API server is running at ${url}`);
}
bootstrap();

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
  });

  await app.listen(port);

  const url = await app.getUrl();
  bootstrapLogger.log(`API server is running at ${url}`);
}
bootstrap();

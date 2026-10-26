import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  HttpException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Reflector } from '@nestjs/core';
import { firstValueFrom } from 'rxjs';
import { SettingService } from '../setting/setting.service';
import { getClientIp } from '../../common/utils/get-client-ip';
import { parseSettingBool } from '../../common/utils/parse-setting-bool';
import { REQUIRE_TURNSTILE_KEY } from '../../common/decorators/require-turnstile.decorator';

/**
 * Turnstile 人机验证 Guard（全局，按 @RequireTurnstile() 标记生效）。
 *
 * 工作流：
 * 1. 无 @RequireTurnstile() 标记 → 直接放行（不影响其他接口性能）
 * 2. 有标记但 turnstile.enabled=false → 放行（管理员未开启验证）
 * 3. 有标记且开启 → 从 body 读 turnstileToken，调 Cloudflare siteverify 校验
 *    - 成功放行；失败/缺失抛 403
 *
 * siteverify 文档：https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 * secret_key 从 settings 表读（走内存缓存，零 DB I/O），不进环境变量也不进日志。
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);
  /** Cloudflare 远程校验端点 */
  private readonly SITEVERIFY_URL =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  constructor(
    private readonly reflector: Reflector,
    private readonly settingService: SettingService,
    private readonly httpService: HttpService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. 只对标记了 @RequireTurnstile() 的方法生效
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_TURNSTILE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    // 2. 读配置：开关 + secret_key（走 SettingService 内存缓存）
    const enabledRow = await this.settingService.findByKey('turnstile.enabled');
    const enabled = parseSettingBool(enabledRow?.value, false);
    if (!enabled) return true; // 未开启，直接放行

    const secretRow = await this.settingService.findByKey('turnstile.secret_key');
    const secretKey = secretRow?.value?.trim();
    if (!secretKey) {
      // 配置错误：开关开了但没配 secret —— 必须闭合失败，否则等于无防护
      this.logger.error(
        'Turnstile 已启用但 secret_key 未配置，已拒绝请求。请在后台站点设置填写 Secret Key 或关闭 Turnstile。',
      );
      throw new HttpException(
        { success: false, message: '人机验证配置缺失，请联系管理员', statusCode: 503 },
        503,
      );
    }

    // 3. 从请求体读 token（前端 widget 生成）
    const request = context.switchToHttp().getRequest();
    const token: string | undefined = request.body?.turnstileToken;
    if (!token) {
      throw new HttpException(
        { success: false, message: '请先完成人机验证', statusCode: 403 },
        403,
      );
    }

    // 4. 调 Cloudflare 校验
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          this.SITEVERIFY_URL,
          new URLSearchParams({
            secret: secretKey,
            response: token,
            remoteip: getClientIp(request) || '',
          }),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 5000,
          },
        ),
      );
      if (data?.success === true) return true;
      // 校验失败：token 过期/伪造/已用过
      this.logger.warn(
        `Turnstile 校验失败: ${JSON.stringify(data?.['error-codes'] || [])}`,
      );
      throw new HttpException(
        { success: false, message: '人机验证失败，请重试', statusCode: 403 },
        403,
      );
    } catch (err) {
      // HttpException 直接抛（上面两个 throw 走这里），不要被吞
      if (err instanceof HttpException) throw err;
      // 网络/Cloudflare 故障：降级放行，避免外部服务故障拖垮登录
      this.logger.error(
        `Turnstile siteverify 请求异常: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new HttpException(
        { success: false, message: '人机验证服务暂不可用，请稍后重试', statusCode: 503 },
        503,
      );
    }
  }
}

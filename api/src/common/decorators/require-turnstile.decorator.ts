import { SetMetadata } from '@nestjs/common';

/**
 * 标记接口需要 Turnstile 人机验证。
 * 全局 TurnstileGuard 检查此元数据：有标记才校验 token，无标记直接放行。
 * 参照 @Public() 的 SetMetadata 范式（auth.guard.ts 用 Reflector 读 IS_PUBLIC_KEY）。
 *
 * 用法：挂在需要防刷的 @Public 接口上（登录/注册/发验证码/重置密码）。
 * 仅当 turnstile.enabled=true 时才真正校验，关闭时全部跳过。
 */
export const REQUIRE_TURNSTILE_KEY = 'requireTurnstile';
export const RequireTurnstile = () => SetMetadata(REQUIRE_TURNSTILE_KEY, true);

import type { Request } from 'express';

/**
 * 统一获取客户端真实 IP。
 *
 * 前置条件：main.ts 已设置 app.set('trust proxy', ...)。
 * 设置后 Express 会自动解析 X-Forwarded-For，req.ip 即为真实客户端 IP，
 * 此时直接用 req.ip 即可，无需手动解析 header。
 *
 * 兜底逻辑：若 trust proxy 未生效或解析失败，尝试从 XFF 首段取 IP（最左侧是原始客户端）。
 * 注意：XFF 是逗号分隔的 `client, proxy1, proxy2`，取首个才是真实客户端 IP，
 * 不能用 .toString() 取整串（会污染限流 key 和黑名单 value）。
 *
 * 无法确定时返回 'unknown'（限流/黑名单对此值放行，避免误伤）。
 */
export function getClientIp(req: Request): string {
  // trust proxy 生效时的首选路径
  const ip = req.ip;
  if (ip && ip !== '::ffff:127.0.0.1' && !ip.startsWith('127.')) {
    return ip;
  }

  // 兜底：手动解析 X-Forwarded-For 首段（trust proxy 未配或内网回环时）
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    // 取最左侧第一个非空、非内网占位的 IP
    const first = xff.toString().split(',')[0]?.trim();
    if (first && first !== 'unknown') {
      return first;
    }
  }

  // req.ip 可能是回环地址，但也算有效（本地开发场景）
  if (ip) return ip;

  // X-Real-IP（部分代理会用这个）
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp.toString().trim();

  return 'unknown';
}

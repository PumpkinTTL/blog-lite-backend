import type { Request } from 'express';

/**
 * 统一获取客户端真实 IP。
 *
 * 唯一信任来源：req.ip（由 Express trust proxy 解析）。
 * 生产前置：nginx 用 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`，
 * 应用 TRUST_PROXY 与真实代理跳数一致——此时 req.ip 即真实客户端。
 *
 * 【红队 V2】不再手动解析 X-Forwarded-For / X-Real-IP 兜底：
 * 客户端可伪造这两个头——回退路径存在时，攻击者每次请求换一个伪造 IP 即可
 * 绕过 IP 限流/自动拉黑，还能把任意第三方 IP 投毒进黑名单。
 * 直接访问源站端口（绕过 nginx）的场景应靠防火墙封 5200 外网入口解决，
 * 而不是在应用层信任可伪造的头。无法确定时返回 'unknown'（限流对其放行）。
 */
export function getClientIp(req: Request): string {
  const ip = req.ip;
  if (ip) return ip;
  return 'unknown';
}

/**
 * settings 布尔值统一解析（第5轮·配置矩阵审查 M8）。
 *
 * 此前各消费方口径分裂：turnstile.guard 严格 === 'true' 且不 trim 不 lowercase，
 * 其余守卫 trim+lowercase，各 controller 用 !== 'false' && !== '0'——
 * 值写成 'TRUE'/' true' 时前端（宽松 toBool）与后端（严格比对）判定分裂，
 * 例如 turnstile.enabled='TRUE'：前台渲染验证码要求 token，后端却不校验，防护静默失效。
 */
export function parseSettingBool(
  raw: string | null | undefined,
  /** 键缺失或空串时的默认值（大多数开关缺省=开，maintenance/turnstile 缺省=关） */
  defaultWhenMissing: boolean,
): boolean {
  if (raw === null || raw === undefined) return defaultWhenMissing;
  const v = raw.trim().toLowerCase();
  if (v === '') return defaultWhenMissing;
  return v === 'true' || v === '1';
}

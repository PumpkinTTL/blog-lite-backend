/**
 * 设置项敏感值掩码（安全审计修复）
 *
 * 背景：GET /setting* 会把全部配置回显到 admin 前端，其中 smtp.pass /
 * turnstile.secret_key / ai.tavily_key / storage.r2.accounts（JSON 内含
 * R2 secretAccessKey）属于机密。admin-only 端点也会经浏览器内存/日志/XSS
 * 外泄，因此统一在出口掩码（空串），配合保存时的空值回填合并：
 *
 * - 读：敏感 value 返回 ''（前端表单"留空=不改"，与现有交互兼容）
 * - 写：敏感 key 提交空串 → 跳过更新（保留 DB 原值）；R2 accounts JSON
 *       里 secretAccessKey 为空的账号按 id 从旧记录回填（编辑非 secret
 *       字段时无需重输密钥）。想彻底清除某项需直接操作 DB（低频运维操作）。
 *
 * 内部读取（mailer/media/ai/turnstile 等模块的 findByKey）不走本层，拿到的
 * 始终是真实值。
 */

/** 简单敏感 key（value 整体是机密，回显置空） */
export const SENSITIVE_SETTING_KEYS = new Set([
  'smtp.pass',
  'ai.tavily_key',
  'turnstile.secret_key',
]);

/** R2 多账号配置（JSON 数组，仅其中的 secretAccessKey 是机密） */
export const R2_ACCOUNTS_KEY = 'storage.r2.accounts';

type SettingLike = { key: string; value: string };

/** 出口掩码：敏感 value → ''；R2 accounts 内每项 secretAccessKey → '' */
export function maskSettingItem<T extends SettingLike>(item: T): T {
  if (item.key === R2_ACCOUNTS_KEY) {
    try {
      const list = JSON.parse(item.value || '[]');
      if (Array.isArray(list)) {
        const masked = list.map((a: Record<string, unknown>) =>
          a && typeof a === 'object' && a.secretAccessKey
            ? { ...a, secretAccessKey: '' }
            : a,
        );
        return { ...item, value: JSON.stringify(masked) };
      }
    } catch {
      // JSON 解析失败：原样返回（不阻断读，写侧有校验兜底）
    }
    return item;
  }
  if (SENSITIVE_SETTING_KEYS.has(item.key)) {
    return { ...item, value: '' };
  }
  return item;
}

/**
 * 保存前合并：把"掩码回显后未修改"的空值还原成 DB 原值，防止前端把
 * 空串原样存回破坏现有配置。
 */
export async function restoreSecretsBeforeSave(
  items: Record<string, string>,
  getOldValue: (key: string) => Promise<string | null>,
): Promise<Record<string, string>> {
  const out = { ...items };

  if (R2_ACCOUNTS_KEY in out) {
    let list: unknown;
    try {
      list = JSON.parse(out[R2_ACCOUNTS_KEY] || '[]');
    } catch {
      list = null; // 非法 JSON 原样透传，由前端校验/后续使用方报错
    }
    if (Array.isArray(list)) {
      const oldRaw = await getOldValue(R2_ACCOUNTS_KEY);
      let oldList: unknown[] = [];
      try {
        oldList = oldRaw ? JSON.parse(oldRaw) : [];
      } catch {
        oldList = [];
      }
      const oldById = new Map(
        (Array.isArray(oldList) ? oldList : [])
          .filter(
            (a): a is Record<string, unknown> =>
              !!a && typeof a === 'object' && typeof (a as any).id === 'string',
          )
          .map((a) => [a.id as string, a]),
      );
      for (const acc of list) {
        if (
          acc &&
          typeof acc === 'object' &&
          typeof (acc as any).id === 'string' &&
          !(acc as any).secretAccessKey
        ) {
          const old = oldById.get((acc as any).id);
          if (old?.secretAccessKey) {
            (acc as any).secretAccessKey = old.secretAccessKey;
          }
        }
      }
      out[R2_ACCOUNTS_KEY] = JSON.stringify(list);
    }
  }

  for (const key of Object.keys(out)) {
    if (key !== R2_ACCOUNTS_KEY && SENSITIVE_SETTING_KEYS.has(key) && out[key] === '') {
      delete out[key];
    }
  }
  return out;
}

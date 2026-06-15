/**
 * 安全解析分页参数
 *
 * 解决以下边界场景：
 *  - page/pageSize 为非数字字符串（如 "abc"）→ NaN → 退回默认值
 *  - page < 1 → clamp 到 1
 *  - pageSize < 1 → clamp 到默认值
 *  - pageSize > maxPageSize → clamp 到 maxPageSize
 *
 * @example
 * const { page, pageSize } = parsePagination(req.query, { maxPageSize: 100 });
 */
export function parsePagination(
  query: Record<string, any> | undefined,
  opts: { defaultPage?: number; defaultPageSize?: number; maxPageSize?: number } = {},
): { page: number; pageSize: number } {
  const defaultPage = opts.defaultPage ?? 1;
  const defaultPageSize = opts.defaultPageSize ?? 20;
  const maxPageSize = opts.maxPageSize ?? 100;

  const rawPage = query?.page;
  const rawPageSize = query?.pageSize;

  // parseInt 失败时（NaN）回退到默认值
  const parsedPage = rawPage === undefined || rawPage === null || rawPage === '' ? defaultPage : parseInt(String(rawPage), 10);
  const parsedPageSize = rawPageSize === undefined || rawPageSize === null || rawPageSize === '' ? defaultPageSize : parseInt(String(rawPageSize), 10);

  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : defaultPage;
  const pageSize = Number.isFinite(parsedPageSize) && parsedPageSize >= 1 ? Math.min(parsedPageSize, maxPageSize) : defaultPageSize;

  return { page, pageSize };
}

/**
 * 单值版：安全解析 page（默认 1，NaN/负数 → 默认值）
 *
 * 用法：替换 controller 中 `Math.max(parseInt(page || '1'), 1)` 的反模式
 */
export function parsePage(raw: string | undefined, defaultValue = 1): number {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 1 ? n : defaultValue;
}

/**
 * 单值版：安全解析 pageSize（默认 20，NaN/负数 → 默认值，超过 max 截断）
 *
 * 用法：替换 controller 中 `Math.min(parseInt(pageSize || '20'), 100)` 的反模式
 */
export function parsePageSize(raw: string | undefined, defaultValue = 20, max = 100): number {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : defaultValue;
}


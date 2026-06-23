import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';

export interface FilterConfig {
  /** 精确匹配字段 */
  exact?: Record<string, string | number | undefined>;
  /** LIKE 模糊匹配字段，值为搜索关键词 */
  like?: { keyword?: string; fields: string[] };
}

/**
 * 转义 LIKE 的通配符（% / _ / \），避免用户输入的这些字符被当通配符匹配。
 * 例如搜 "100%" 会被转义成 "100\%"，只匹配字面的 "100%"。
 * 配合 LIKE '...' ESCAPE '\\' 使用（MySQL 默认转义符就是 \）。
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

/**
 * 为 QueryBuilder 统一应用过滤条件
 * @param qb QueryBuilder 实例
 * @param filters 过滤配置
 * @returns 应用了过滤条件的 QueryBuilder
 *
 * @example
 * applyFilters(qb, {
 *   exact: { id: 1, status: 0 },
 *   like: { keyword: 'test', fields: ['e.name', 'e.slug'] },
 * })
 */
export function applyFilters<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  filters: FilterConfig,
): SelectQueryBuilder<T> {
  if (filters.exact) {
    for (const [field, value] of Object.entries(filters.exact)) {
      if (value !== undefined) {
        qb.andWhere(`${field} = :${field.replace('.', '_')}`, {
          [field.replace('.', '_')]: value,
        });
      }
    }
  }

  if (filters.like?.keyword && filters.like.fields.length > 0) {
    // 转义 % / _ / \，加 ESCAPE '\\' 让反斜杠作为转义符生效
    const keyword = escapeLike(filters.like.keyword);
    const conditions = filters.like.fields
      .map((f) => `${f} LIKE :kw ESCAPE '\\\\'`)
      .join(' OR ');
    qb.andWhere(`(${conditions})`, { kw: `%${keyword}%` });
  }

  return qb;
}

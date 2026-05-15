import { SelectQueryBuilder } from 'typeorm';

export interface FilterConfig {
  /** 精确匹配字段 */
  exact?: Record<string, string | number | undefined>;
  /** LIKE 模糊匹配字段，值为搜索关键词 */
  like?: { keyword?: string; fields: string[] };
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
export function applyFilters<T>(
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
    const conditions = filters.like.fields
      .map((f) => `${f} LIKE :kw`)
      .join(' OR ');
    qb.andWhere(`(${conditions})`, { kw: `%${filters.like.keyword}%` });
  }

  return qb;
}

/**
 * 安全解析日期查询参数。
 *
 * @param raw 原始字符串（来自 @Query）
 * @param required 是否必填（true 时非法/空抛 BadRequestException）
 * @returns Date | undefined（required=false 且空/非法时返回 undefined）
 * @throws BadRequestException 当 required=true 且值为空或非法日期
 *
 * 用途：防止 `new Date('abc')` 产生 Invalid Date 透传到 DB 查询导致 500。
 */
import { BadRequestException } from '@nestjs/common';

export function parseDateParam(
  raw: string | undefined,
  required = false,
): Date | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    if (required) throw new BadRequestException('日期参数必填');
    return undefined;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    if (required) throw new BadRequestException('日期格式不合法');
    return undefined;
  }
  return d;
}

/**
 * 安全解析可选整数查询参数。
 *
 * @param raw 原始字符串（来自 @Query）
 * @returns number | undefined（空/非数字/非正整数时返回 undefined）
 *
 * 用途：防止 `parseInt('abc')=NaN` 透传到 applyFilters 导致语义混乱。
 * 路径参数请用 ParseIntPipe，这里只处理可选的 query 参数。
 */
export function parseOptionalInt(raw: string | undefined): number | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

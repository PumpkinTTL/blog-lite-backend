import { IsEnum, IsInt, Min, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export type InteractionEntityType = 'post' | 'comment';
export type InteractionType = 'like' | 'favorite';

/**
 * 切换互动状态（已存在 → 取消；不存在 → 创建）
 */
export class ToggleInteractionDto {
  @IsEnum(['post', 'comment'])
  entityType: InteractionEntityType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  entityId: number;

  @IsEnum(['like', 'favorite'])
  type: InteractionType;
}

/**
 * 批量查询用户在多个实体上的互动状态
 */
export class BatchStatusQueryDto {
  @IsEnum(['post', 'comment'])
  entityType: InteractionEntityType;

  @IsEnum(['like', 'favorite'])
  type: InteractionType;

  /**
   * 逗号分隔的实体 ID 列表（query string，例如 ?entityIds=1,2,3）
   * 用 transform 转换为数组，避免 nest 默认把 array 视为 object
   */
  entityIds: number[];
}

/**
 * 批量查多个实体的互动计数
 */
export class BatchCountDto {
  @IsEnum(['post', 'comment'])
  entityType: InteractionEntityType;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  entityIds: number[];
}

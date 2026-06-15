import {
  IsString,
  IsEnum,
  IsInt,
  Min,
  IsOptional,
  Length,
  IsArray,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export type CommentEntityType = 'post';

/**
 * 创建评论
 * - parentId 缺省：一级评论
 * - parentId 给定：二级回复（必须是已存在的一级评论）
 *   - replyToUserId 可选：同一一级下 @ 另一条二级作者
 */
export class CreateCommentDto {
  @IsEnum(['post'])
  entityType: CommentEntityType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  entityId: number;

  @IsString()
  @Length(1, 2000)
  content: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parentId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  replyToUserId?: number | null;
}

/**
 * 编辑评论（仅本人 + 审核未通过前可编辑）
 */
export class UpdateCommentDto {
  @IsString()
  @Length(1, 2000)
  content: string;
}

export class BatchIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];
}

/**
 * 管理员审核
 */
export class ModerateCommentDto {
  @IsEnum(['approved', 'rejected'])
  status: 'approved' | 'rejected';
}

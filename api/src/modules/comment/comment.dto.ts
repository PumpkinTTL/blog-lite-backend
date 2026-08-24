import {
  IsString,
  IsEnum,
  IsInt,
  Min,
  IsOptional,
  Length,
  IsArray,
  ArrayNotEmpty,
  ArrayMaxSize,
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
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}

/**
 * 管理员审核
 */
export class ModerateCommentDto {
  @IsEnum(['approved', 'rejected'])
  status: 'approved' | 'rejected';
}

/**
 * 批量审核（ids + status 组合校验）
 * 替代 controller 里 inline 的 { ids: number[]; status } —— 那个运行时无校验，
 * status 可被传任意字符串直接写库污染审核状态机。
 */
export class BatchModerateDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];

  @IsEnum(['approved', 'rejected'])
  status: 'approved' | 'rejected';
}

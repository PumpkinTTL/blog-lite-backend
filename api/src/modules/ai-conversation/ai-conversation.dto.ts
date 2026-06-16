import { IsInt, IsString, IsOptional, IsArray } from 'class-validator';

/** 保存/更新对话历史（按 postId upsert） */
export class SaveConversationDto {
  @IsInt()
  postId: number;

  /** 完整 messages 数组（直接传数组，service 内 JSON.stringify） */
  @IsArray()
  messages: unknown[];

  @IsString()
  @IsOptional()
  model?: string;
}

/** 管理页批量删除 */
export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

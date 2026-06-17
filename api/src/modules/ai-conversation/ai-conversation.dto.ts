import { IsInt, IsString, IsOptional, IsArray, Min } from 'class-validator';

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

  /** 累计输入 token（持久化，重开不重算） */
  @IsInt()
  @Min(0)
  @IsOptional()
  promptTokens?: number;

  /** 累计输出 token */
  @IsInt()
  @Min(0)
  @IsOptional()
  completionTokens?: number;

  /** 对话轮次 */
  @IsInt()
  @Min(0)
  @IsOptional()
  rounds?: number;
}

/** 管理页批量删除 */
export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

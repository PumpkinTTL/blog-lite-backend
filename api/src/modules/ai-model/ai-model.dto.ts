import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  MaxLength,
  IsArray,
} from 'class-validator';

/** 创建 AI 模型 */
export class CreateAiModelDto {
  @IsInt()
  providerId: number;

  @IsString()
  @MaxLength(200)
  modelId: string;

  @IsString()
  @MaxLength(100)
  displayName: string;

  @IsInt()
  @IsOptional()
  maxContextTokens?: number;

  @IsInt()
  @IsOptional()
  maxOutputTokens?: number;

  @IsInt()
  @IsIn([0, 1])
  @IsOptional()
  supportsTools?: number;

  @IsInt()
  @IsIn([0, 1])
  @IsOptional()
  supportsThinking?: number;

  @IsInt()
  @IsIn([0, 1])
  @IsOptional()
  status?: number;
}

/** 更新 AI 模型 */
export class UpdateAiModelDto {
  @IsInt()
  @IsOptional()
  providerId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  modelId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;

  @IsInt()
  @IsOptional()
  maxContextTokens?: number;

  @IsInt()
  @IsOptional()
  maxOutputTokens?: number;

  @IsInt()
  @IsIn([0, 1])
  @IsOptional()
  supportsTools?: number;

  @IsInt()
  @IsIn([0, 1])
  @IsOptional()
  supportsThinking?: number;

  @IsInt()
  @IsIn([0, 1])
  @IsOptional()
  status?: number;
}

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

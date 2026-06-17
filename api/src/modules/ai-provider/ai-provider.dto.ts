import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  MaxLength,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import type { AiProviderModel } from './ai-provider.entity';

/** 单个模型的输入校验（嵌入 provider.models 数组） */
export class AiProviderModelDto {
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

  @Transform(({ value }) => value === true ? 1 : value === false ? 0 : value)
  @IsIn([0, 1])
  @IsOptional()
  supportsTools?: number;

  @Transform(({ value }) => value === true ? 1 : value === false ? 0 : value)
  @IsIn([0, 1])
  @IsOptional()
  supportsThinking?: number;
}

/** 创建 AI 提供商 */
export class CreateAiProviderDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsString()
  @MaxLength(200)
  baseUrl: string;

  @IsString()
  @MaxLength(200)
  apiKey: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  protocol?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiProviderModelDto)
  @IsOptional()
  models?: AiProviderModel[];

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;

  @IsInt()
  @IsIn([0, 1])
  @IsOptional()
  status?: number;
}

/** 批量删除 */
export class BatchIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ids: number[];
}

/** 更新 AI 提供商（全部可选） */
export class UpdateAiProviderDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  baseUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  apiKey?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  protocol?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiProviderModelDto)
  @IsOptional()
  models?: AiProviderModel[];

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;

  @IsInt()
  @IsIn([0, 1])
  @IsOptional()
  status?: number;
}

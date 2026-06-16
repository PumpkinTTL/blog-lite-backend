import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  MaxLength,
  IsArray,
} from 'class-validator';

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

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;

  @IsInt()
  @IsIn([0, 1])
  @IsOptional()
  status?: number;
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
  @IsInt({ each: true })
  ids: number[];
}

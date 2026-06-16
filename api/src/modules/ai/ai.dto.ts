import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  MaxLength,
} from 'class-validator';

/** AI 可生成的字段类型 */
export type AiGenerateField = 'subtitle' | 'summary' | 'slug';

export const AI_GENERATE_FIELDS: readonly AiGenerateField[] = [
  'subtitle',
  'summary',
  'slug',
];

/**
 * 统一 AI 生成入参
 * - title / content 作为上下文（均可空，但至少传一个）
 * - fields 指定本次要生成哪些内容（复选框语义）
 * - model 可覆盖默认模型
 */
export class AiGenerateDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsArray()
  @IsIn(AI_GENERATE_FIELDS as readonly string[], { each: true })
  fields: AiGenerateField[];

  @IsString()
  @IsOptional()
  model?: string;
}

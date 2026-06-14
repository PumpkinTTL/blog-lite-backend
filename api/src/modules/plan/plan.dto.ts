import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  IsBoolean,
  IsArray,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9_]+$/, { message: 'slug 只能包含小写字母、数字和下划线' })
  slug: string;

  @IsEnum(['plus', 'pro', 'max'])
  level: 'plus' | 'pro' | 'max';

  @IsInt()
  @Min(0)
  durationDays: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  priceCents?: number;

  @IsArray()
  @IsOptional()
  benefits?: string[];

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  sort?: number;
}

export class UpdatePlanDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  // slug 不允许修改（避免已发放的 membership 找不到套餐）

  @IsEnum(['plus', 'pro', 'max'])
  @IsOptional()
  level?: 'plus' | 'pro' | 'max';

  @IsInt()
  @Min(0)
  @IsOptional()
  durationDays?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  priceCents?: number;

  @IsArray()
  @IsOptional()
  benefits?: string[];

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  sort?: number;
}

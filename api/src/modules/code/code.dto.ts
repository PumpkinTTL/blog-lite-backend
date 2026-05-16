import { IsString, IsEnum, IsInt, IsOptional, IsDateString, IsObject, IsArray, IsNumber, Min, ValidateIf } from 'class-validator';

/**
 * 优惠信息
 * percentage: 打折，value = 折扣比例（如 0.8 = 八折）
 * threshold: 满减，value = 减免金额，threshold = 最低消费金额
 * fixed: 立减，value = 减免金额
 */
export class DiscountDto {
  @IsEnum(['percentage', 'threshold', 'fixed'])
  type: 'percentage' | 'threshold' | 'fixed';

  @IsNumber()
  @Min(0)
  value: number;

  @ValidateIf((o) => o.type === 'threshold')
  @IsNumber()
  @Min(0)
  threshold?: number;
}

export class CreateCodeDto {
  @IsString()
  @IsEnum(['invitation', 'activation', 'discount'])
  type: 'invitation' | 'activation' | 'discount';

  @IsInt()
  @Min(0)
  @IsOptional()
  maxUses?: number;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsInt()
  @IsOptional()
  creatorId?: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ValidateIf((o) => o.type === 'discount')
  @IsObject()
  discount?: { type: 'percentage' | 'threshold' | 'fixed'; value: number; threshold?: number };
}

export class UpdateCodeDto {
  @IsEnum(['active', 'used', 'expired', 'disabled'])
  @IsOptional()
  status?: 'active' | 'used' | 'expired' | 'disabled';

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  discount?: { type: 'percentage' | 'threshold' | 'fixed'; value: number; threshold?: number };
}

export class VerifyCodeDto {
  @IsString()
  code: string;

  @IsString()
  @IsOptional()
  type?: 'invitation' | 'activation' | 'discount';
}

export class BatchCreateCodeDto {
  @IsString()
  @IsEnum(['invitation', 'activation', 'discount'])
  type: 'invitation' | 'activation' | 'discount';

  @IsInt()
  @Min(1)
  count: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxUses?: number;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ValidateIf((o) => o.type === 'discount')
  @IsObject()
  discount?: { type: 'percentage' | 'threshold' | 'fixed'; value: number; threshold?: number };
}

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

import {
  IsInt,
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';

export class GrantMembershipDto {
  @IsInt()
  userId: number;

  @IsInt()
  planId: number;

  /**
   * 自定义开通时长（天）
   * - 不传：使用套餐自身 durationDays（兑换码、常规续期场景）
   * - 传 0：终身有效（覆盖套餐）
   * - 传正整数：按该天数开通（管理员灵活赠送）
   */
  @IsInt()
  @Min(0)
  @IsOptional()
  days?: number;

  @IsEnum(['admin', 'code', 'payment'])
  @IsOptional()
  source?: 'admin' | 'code' | 'payment';

  @IsInt()
  @IsOptional()
  sourceId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  note?: string;
}

/**
 * 兑换码兑换会员（用户端调用）
 */
export class RedeemMembershipDto {
  @IsString()
  code: string;
}

export class UpdateMembershipDto {
  @IsEnum(['active', 'expired', 'cancelled'])
  @IsOptional()
  status?: 'active' | 'expired' | 'cancelled';

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  note?: string;
}

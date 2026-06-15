import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsDateString,
  IsIn,
  MaxLength,
} from 'class-validator';

const TYPES = ['ip', 'user'] as const;

export class CreateBlacklistDto {
  @IsString()
  @IsIn(TYPES, { message: '类型必须是 ip 或 user' })
  type: string;

  @IsString()
  @MaxLength(100)
  value: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  reason?: string;

  /** ISO 字符串，null=永久封禁 */
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class UpdateBlacklistDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  reason?: string;

  @IsString()
  @IsOptional()
  @IsIn(['active', 'expired'])
  status?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

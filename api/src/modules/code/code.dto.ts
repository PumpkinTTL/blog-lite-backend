import { IsString, IsEnum, IsInt, IsOptional, IsDateString, IsObject, IsArray, Min } from 'class-validator';

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
}

export class UpdateCodeDto {
  @IsEnum(['active', 'used', 'expired', 'disabled'])
  @IsOptional()
  status?: 'active' | 'used' | 'expired' | 'disabled';

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
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
}

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}
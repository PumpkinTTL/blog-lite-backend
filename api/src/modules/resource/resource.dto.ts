import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray, ArrayMaxSize,
  MaxLength,
  Min,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 网盘链接项 */
export class PanLinkDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsString()
  @MaxLength(500)
  url: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  code?: string | null;
}

export class CreateResourceDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  cover?: string;

  @IsInt()
  @IsOptional()
  categoryId?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(65535)
  content?: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PanLinkDto)
  @IsOptional()
  panLinks?: PanLinkDto[];

  @IsInt()
  @Min(0)
  @IsOptional()
  priceCents?: number;

  @IsEnum(['draft', 'published', 'login', 'private'])
  @IsOptional()
  status?: 'draft' | 'published' | 'login' | 'private';

  @IsEnum(['plus', 'pro', 'max'])
  @IsOptional()
  minMemberLevel?: 'plus' | 'pro' | 'max' | null;

  /** 解锁所需的角色组 ID 列表（空=无门槛），会员权益判定依据 */
  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  @IsOptional()
  requiredRoleIds?: number[] | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  // private 状态下的可见性配置（参照 post 模块）
  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  @IsOptional()
  allowedUserIds?: number[];

  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  @IsOptional()
  allowedRoleIds?: number[];
}

export class UpdateResourceDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  cover?: string;

  @IsInt()
  @IsOptional()
  categoryId?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(65535)
  content?: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PanLinkDto)
  @IsOptional()
  panLinks?: PanLinkDto[];

  @IsInt()
  @Min(0)
  @IsOptional()
  priceCents?: number;

  @IsEnum(['draft', 'published', 'login', 'private'])
  @IsOptional()
  status?: 'draft' | 'published' | 'login' | 'private';

  @IsEnum(['plus', 'pro', 'max'])
  @IsOptional()
  minMemberLevel?: 'plus' | 'pro' | 'max' | null;

  /** 解锁所需的角色组 ID 列表（空=无门槛），会员权益判定依据 */
  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  @IsOptional()
  requiredRoleIds?: number[] | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  @IsOptional()
  allowedUserIds?: number[];

  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  @IsOptional()
  allowedRoleIds?: number[];
}

/** 可见性配置专用 DTO */
export class UpdateVisibilityDto {
  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  allowedUserIds: number[];

  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  allowedRoleIds: number[];
}

/** 资源兑换入口 */
export class RedeemResourceDto {
  @IsString({ message: '兑换码格式不正确' })
  @IsNotEmpty({ message: '请输入兑换码' })
  code: string;
}

export class BatchIdsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  ids: number[];
}

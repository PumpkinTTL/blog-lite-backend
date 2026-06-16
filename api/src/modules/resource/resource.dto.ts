import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  MaxLength,
  Min,
  ValidateNested,
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
  content?: string;

  @IsArray()
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

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  // private 状态下的可见性配置（参照 post 模块）
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  allowedUserIds?: number[];

  @IsArray()
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
  content?: string;

  @IsArray()
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

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  allowedUserIds?: number[];

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  allowedRoleIds?: number[];
}

/** 可见性配置专用 DTO */
export class UpdateVisibilityDto {
  @IsArray()
  @IsInt({ each: true })
  allowedUserIds: number[];

  @IsArray()
  @IsInt({ each: true })
  allowedRoleIds: number[];
}

/** 资源兑换入口 */
export class RedeemResourceDto {
  @IsString()
  code: string;
}

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  Min,
  MaxLength,
  IsArray, ArrayMaxSize,
} from 'class-validator';
import type { AdPosition, AdType, AdStatus } from './ad.entity';

export class CreateAdDto {
  @IsString()
  @MaxLength(100)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  subtitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  imageUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  buttonText?: string;

  @IsString()
  @MaxLength(500)
  href: string;

  @IsEnum(['sidebar', 'popup', 'popup_toast'])
  position: AdPosition;

  @IsEnum(['card'])
  @IsOptional()
  type?: AdType;

  @IsEnum(['active', 'inactive'])
  @IsOptional()
  status?: AdStatus;

  @IsDateString()
  @IsOptional()
  startAt?: string;

  @IsDateString()
  @IsOptional()
  endAt?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  adminNote?: string;
}

export class UpdateAdDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  subtitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  imageUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  buttonText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  href?: string;

  @IsEnum(['sidebar', 'popup', 'popup_toast'])
  @IsOptional()
  position?: AdPosition;

  @IsEnum(['card'])
  @IsOptional()
  type?: AdType;

  @IsEnum(['active', 'inactive'])
  @IsOptional()
  status?: AdStatus;

  @IsDateString()
  @IsOptional()
  startAt?: string;

  @IsDateString()
  @IsOptional()
  endAt?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  adminNote?: string;
}

export class BatchIdsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  ids: number[];
}

/** 前台埋点（曝光/点击计数 +1） */
export class TrackAdDto {
  @IsInt()
  id: number;

  @IsEnum(['impression', 'click'])
  type: 'impression' | 'click';
}

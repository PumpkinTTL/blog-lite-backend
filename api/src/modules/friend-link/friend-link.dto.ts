import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  IsUrl,
  IsArray,
  MaxLength,
} from 'class-validator';

export class CreateFriendLinkDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsUrl()
  url: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  logo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsIn(['hidden', 'visible'])
  @IsOptional()
  status?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsInt()
  @IsOptional()
  postId?: number | null;
}

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

export class UpdateFriendLinkDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsUrl()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  logo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsIn(['hidden', 'visible'])
  @IsOptional()
  status?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsInt()
  @IsOptional()
  postId?: number | null;
}

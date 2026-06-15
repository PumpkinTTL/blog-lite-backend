import { IsString, IsOptional, IsInt, IsIn, IsUrl, IsArray } from 'class-validator';

export class CreateFriendLinkDto {
  @IsString()
  name: string;

  @IsUrl()
  url: string;

  @IsString()
  @IsOptional()
  logo?: string;

  @IsString()
  @IsOptional()
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
  name?: string;

  @IsUrl()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  logo?: string;

  @IsString()
  @IsOptional()
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

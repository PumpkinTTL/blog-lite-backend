import { IsString, IsOptional, IsInt, IsIn, IsUrl } from 'class-validator';

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

  @IsIn([0, 1])
  @IsOptional()
  status?: number;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsInt()
  @IsOptional()
  postId?: number | null;
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

  @IsIn([0, 1])
  @IsOptional()
  status?: number;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsInt()
  @IsOptional()
  postId?: number | null;
}

import { IsString, IsOptional, IsArray, IsIn, IsInt } from 'class-validator';

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

export class CreatePostDto {
  @IsString()
  title: string;

  @IsString()
  slug: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  summary?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;

  @IsIn(['draft', 'published', 'login', 'private'])
  @IsOptional()
  status?: string;

  @IsInt()
  @IsOptional()
  categoryId?: number | null;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  tagIds?: number[];

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  allowedUserIds?: number[];

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  allowedRoleIds?: number[];
}

export class UpdatePostDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  summary?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;

  @IsIn(['draft', 'published', 'login', 'private'])
  @IsOptional()
  status?: string;

  @IsInt()
  @IsOptional()
  categoryId?: number | null;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  tagIds?: number[];

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  allowedUserIds?: number[];

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  allowedRoleIds?: number[];
}

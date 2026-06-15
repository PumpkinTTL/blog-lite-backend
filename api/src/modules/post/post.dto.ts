import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  IsInt,
  MaxLength,
} from 'class-validator';

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

export class CreatePostDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(200)
  slug: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  summary?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
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
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  slug?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  summary?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
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

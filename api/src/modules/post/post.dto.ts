import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  IsInt,
  MaxLength,
} from 'class-validator';

export class ToggleInteractDto {
  @IsIn(['like', 'favorite'], { message: 'type 只能是 like 或 favorite' })
  type: 'like' | 'favorite';
}

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
  @IsOptional()
  @MaxLength(200)
  subtitle?: string;

  @IsString()
  @MaxLength(200)
  slug: string;

  @IsString()
  @IsOptional()
  // 限制 1MB（约百万字），防止超大 body 撑爆连接池/内存
  @MaxLength(1048576)
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
  subtitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  slug?: string;

  @IsString()
  @IsOptional()
  // 限制 1MB（约百万字），防止超大 body 撑爆连接池/内存
  @MaxLength(1048576)
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

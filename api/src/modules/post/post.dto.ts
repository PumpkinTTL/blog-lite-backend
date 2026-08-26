import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray, ArrayMaxSize,
  IsIn,
  IsInt, Min,
  MaxLength,
} from 'class-validator';

export class ToggleInteractDto {
  @IsIn(['like', 'favorite'], { message: 'type 只能是 like 或 favorite' })
  type: 'like' | 'favorite';
}

export class BatchIdsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  ids: number[];
}

/** 批量删除（可带 force 彻底删除）。此前用交叉类型 BatchIdsDto & { force? } 声明 Body，
 *  TS 交叉类型反射出的 design:type 是 Object，ValidationPipe 直接跳过校验——
 *  ids 无约束、force 无布尔校验（字符串 "0" 是 truthy，会非预期触发彻底删除） */
export class BatchDeletePostDto extends BatchIdsDto {
  @IsBoolean()
  @IsOptional()
  force?: boolean;
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
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  @IsOptional()
  tagIds?: number[];

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
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  @IsOptional()
  tagIds?: number[];

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

import { IsString, IsOptional, IsArray, IsIn, IsInt } from 'class-validator';

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

  @IsIn([0, 1, 2])
  @IsOptional()
  status?: number;

  @IsInt()
  @IsOptional()
  categoryId?: number | null;

  @IsArray()
  @IsOptional()
  tagIds?: number[];
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

  @IsIn([0, 1, 2])
  @IsOptional()
  status?: number;

  @IsInt()
  @IsOptional()
  categoryId?: number | null;

  @IsArray()
  @IsOptional()
  tagIds?: number[];
}

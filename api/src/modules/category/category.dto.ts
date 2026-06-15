import { IsString, IsOptional, IsInt, IsArray } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsInt()
  @IsOptional()
  parentId?: number | null;
}

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsInt()
  @IsOptional()
  parentId?: number | null;
}

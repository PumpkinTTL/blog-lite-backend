import {
  IsString,
  IsOptional,
  IsInt,
  IsArray, ArrayMaxSize,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateResourceCategoryDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateResourceCategoryDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class BatchIdsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  ids: number[];
}

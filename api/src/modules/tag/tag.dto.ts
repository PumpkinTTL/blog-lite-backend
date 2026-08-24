import {
  IsString,
  IsOptional,
  IsArray, ArrayMaxSize,
  IsInt, Min,
  MaxLength,
} from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MaxLength(30)
  name: string;

  @IsString()
  @MaxLength(30)
  slug: string;
}

export class BatchIdsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  ids: number[];
}

export class UpdateTagDto {
  @IsString()
  @IsOptional()
  @MaxLength(30)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  slug?: string;
}

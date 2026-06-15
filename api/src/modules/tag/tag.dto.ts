import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
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

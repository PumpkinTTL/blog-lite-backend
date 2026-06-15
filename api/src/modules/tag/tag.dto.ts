import { IsString, IsOptional, IsArray, IsInt } from 'class-validator';

export class CreateTagDto {
  @IsString()
  name: string;

  @IsString()
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
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;
}

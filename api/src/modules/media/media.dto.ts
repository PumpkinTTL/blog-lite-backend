import { IsString, IsOptional, IsNumber, IsPositive, IsUrl, IsInt, IsArray } from 'class-validator';

export class CreateMediaDto {
  @IsString()
  filename: string;

  @IsString()
  originalName: string;

  @IsString()
  mimeType: string;

  @IsNumber()
  @IsPositive()
  size: number;

  @IsUrl()
  url: string;

  @IsInt()
  @IsOptional()
  uploaderId?: number;
}

export class UpdateMediaDto {
  @IsString()
  @IsOptional()
  originalName?: string;
}

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

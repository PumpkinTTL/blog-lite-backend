import { IsString, IsOptional, IsNumber, IsPositive, IsUrl, IsInt } from 'class-validator';

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

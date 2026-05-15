import { IsString, IsOptional } from 'class-validator';

export class UpdateSettingDto {
  @IsString()
  value: string;
}

export class CreateSettingDto {
  @IsString()
  key: string;

  @IsString()
  value: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  group?: string;
}

import { IsString, IsOptional, IsObject, IsNotEmptyObject } from 'class-validator';

export class UpdateSettingDto {
  @IsString()
  @IsOptional()
  key?: string;

  @IsString()
  @IsOptional()
  value?: string;

  @IsString()
  @IsOptional()
  description?: string;
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

export class BatchUpdateSettingDto {
  @IsNotEmptyObject()
  @IsObject()
  items: Record<string, string>;
}

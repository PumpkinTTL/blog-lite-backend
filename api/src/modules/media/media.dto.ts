import {
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  IsUrl,
  IsInt,
  IsArray,
  IsEnum,
  Matches,
} from 'class-validator';

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

  @IsString()
  @IsOptional()
  hash?: string;

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

  @IsString()
  @IsOptional()
  note?: string;
}

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

export class UploadStorageDto {
  @IsEnum(['local', 'oss'])
  @IsOptional()
  storageType?: 'local' | 'oss';

  @IsEnum(['aliyun', 'tencent', 'cloudflare', 'backblaze'])
  @IsOptional()
  ossPlatform?: 'aliyun' | 'tencent' | 'cloudflare' | 'backblaze';

  // app/folder 拼进文件路径，必须严格白名单（防路径穿越：禁止 / .. 等）
  @Matches(/^[a-zA-Z0-9_-]{0,32}$/, { message: 'app 只能含字母数字下划线短横线，最长32' })
  @IsOptional()
  app?: string;

  @Matches(/^[a-zA-Z0-9_-]{0,32}$/, { message: 'folder 只能含字母数字下划线短横线，最长32' })
  @IsOptional()
  folder?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

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

/**
 * 申请 R2 presigned 上传 URL
 * 前端选好文件后调用，后端签发 PUT URL（或命中秒传直接返回已有记录）
 */
export class PresignR2Dto {
  @IsString()
  filename: string;

  @IsString()
  contentType: string;

  @IsNumber()
  @IsPositive()
  size: number;

  @IsString()
  @IsOptional()
  hash?: string;

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

/**
 * 直传完成后的入库确认
 * 前端 PUT 到 R2 成功后，携带 key + 元信息回调，后端 HEAD 校验后写 media 记录
 */
export class ConfirmR2Dto {
  @IsString()
  key: string;

  @IsString()
  originalName: string;

  @IsString()
  mimeType: string;

  @IsNumber()
  @IsPositive()
  size: number;

  @IsString()
  hash: string;

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

import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  MinLength,
  IsEmail,
  IsIn,
  ArrayNotEmpty,
  MaxLength,
  IsDateString,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MaxLength(50)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;

  @IsString()
  @MaxLength(50)
  nickname: string;

  @IsEmail()
  @MaxLength(100)
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  avatar?: string;

  @IsIn(['active', 'disabled'])
  @IsOptional()
  status?: string;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  roleIds?: number[];
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  nickname?: string;

  @IsString()
  @IsOptional()
  @MinLength(6)
  @MaxLength(100)
  password?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(100)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  avatar?: string;

  @IsIn(['active', 'disabled'])
  @IsOptional()
  status?: string;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  roleIds?: number[];
}

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  nickname?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(100)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  avatar?: string;
}

/**
 * 封禁/解封用户请求体：
 * - reason: 封禁原因（记录到审计日志，封禁时填写，解封可留空）
 * - bannedUntil: 封禁截止时间 ISO 字符串。封禁时传：null/不传=永久，有值=临时；
 *                解封时忽略（后端会强制清空）。
 */
export class ToggleStatusDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  reason?: string;

  @IsDateString()
  @IsOptional()
  bannedUntil?: string | null;
}

export class BatchIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class SendResetCodeDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordByCodeDto {
  @IsEmail()
  email: string;

  @IsString()
  code: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

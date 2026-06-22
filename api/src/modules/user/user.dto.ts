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
  Matches,
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

  /** 性别 0=未知 1=男 2=女 */
  @IsInt()
  @IsIn([0, 1, 2])
  @IsOptional()
  gender?: number;

  /** 个性签名 */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  signature?: string;

  /** 手机号（简易格式校验，主要防乱填超长字符串） */
  @IsString()
  @IsOptional()
  @MaxLength(20)
  @Matches(/^[0-9+\-\s]*$/, { message: '手机号格式不正确' })
  phone?: string;
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

/**
 * 发送登录/注册验证码（与忘记密码的 send-reset-code 区分）。
 * 登录场景下未注册邮箱需明确报错（而非防枚举静默成功），
 * 否则用户一直收不到码却看到"已发送"，体验断裂。
 */
export class SendLoginCodeDto {
  @IsEmail()
  email: string;
}

/**
 * 邮箱验证码登录。
 * 仅凭邮箱 + 验证码签发 token，无需密码。
 */
export class LoginByCodeDto {
  @IsEmail()
  email: string;

  @IsString()
  code: string;

  /** 可选邀请码：若邮箱未注册，验证通过后自动注册并登录 */
  @IsString()
  @IsOptional()
  invitationCode?: string;
}

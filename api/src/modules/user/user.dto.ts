import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray, ArrayMaxSize, Min,
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
  // username 概念已移除，管理员建号不再需要登录账号。
  // 新建用户用 id（自增）作为唯一标识，登录用 id 或 email。

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;

  @IsString()
  @MaxLength(50)
  nickname: string;

  @IsEmail({}, { message: '邮箱格式不正确' })
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
  @ArrayMaxSize(100)
  @Min(1, { each: true })
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

  @IsEmail({}, { message: '邮箱格式不正确' })
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
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  @IsOptional()
  roleIds?: number[];
}

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  nickname?: string;

  @IsEmail({}, { message: '邮箱格式不正确' })
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
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  newPassword: string;
}

export class SendResetCodeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}

export class ResetPasswordByCodeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsString()
  @MaxLength(32)
  code: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  newPassword: string;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}

/**
 * 发送登录/注册验证码（与忘记密码的 send-reset-code 区分）。
 * 登录场景下未注册邮箱需明确报错（而非防枚举静默成功），
 * 否则用户一直收不到码却看到"已发送"，体验断裂。
 */
export class SendLoginCodeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}

/**
 * 邮箱换绑：给新邮箱发验证码。
 * newEmail 必须未被其他用户占用（service 层校验）。
 */
export class SendChangeEmailCodeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  newEmail: string;
}

/**
 * 邮箱换绑：用新邮箱 + 验证码完成换绑。
 */
export class ChangeEmailDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  newEmail: string;

  @IsString()
  code: string;
}

/**
 * 邮箱验证码登录。
 * 仅凭邮箱 + 验证码签发 token，无需密码。
 */
export class LoginByCodeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsString()
  @MaxLength(32)
  code: string;

  // 设备 ID：同 LoginDto，前端生成，续签凭证
  @IsString()
  @IsNotEmpty({ message: '设备标识缺失' })
  deviceId: string;

  @IsString()
  @IsOptional()
  fingerprint?: string;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}

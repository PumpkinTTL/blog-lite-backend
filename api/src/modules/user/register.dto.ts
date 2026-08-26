import { IsString, IsNotEmpty, MinLength, IsEmail, IsOptional, IsEnum, MaxLength } from 'class-validator';

export class RegisterDto {
  // username 概念已移除：注册不再要求登录账号。
  // 用户用 nickname（显示名）+ email（登录凭证）+ password 注册，登录用 id 或 email。

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  nickname: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  /** 邀请码：registration.require_invitation 开启时必填（服务端校验），关闭时可省略 */
  invitationCode?: string;

  @IsString()
  @IsOptional()
  /** 邮箱验证码：email 提供时必填（服务端校验），证明邮箱所有权 */
  emailCode?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsString()
  @IsOptional()
  @IsEnum(['web', 'mobile', 'api'])
  registerSource?: string;

  // 设备 ID：同 LoginDto，前端生成，续签凭证
  @IsString()
  @IsNotEmpty({ message: '设备标识缺失' })
  deviceId: string;

  @IsString()
  @IsOptional()
  fingerprint?: string;

  @IsString()
  @IsOptional()
  turnstileToken?: string;
}

export class ClientLoginDto {
  // 登录凭证：id（纯数字）或 email。username 概念已移除。
  @IsString()
  @IsNotEmpty()
  account: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty({ message: '设备标识缺失' })
  deviceId: string;

  @IsString()
  @IsOptional()
  fingerprint?: string;

  @IsString()
  @IsOptional()
  turnstileToken?: string;
}

/** 登出请求体（@Public 路由：refreshToken 有长度上限，防 10MB 字符串透传吊销端点） */
export class LogoutDto {
  @IsString()
  @MaxLength(768)
  @IsOptional()
  refreshToken?: string;
}

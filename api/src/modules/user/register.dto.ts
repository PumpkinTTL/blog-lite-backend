import { IsString, IsNotEmpty, MinLength, IsEmail, IsOptional, IsEnum } from 'class-validator';

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
  @IsNotEmpty()
  invitationCode: string;

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
}

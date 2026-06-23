import { IsString, IsNotEmpty, MinLength, IsEmail, IsOptional, IsEnum } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
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
  @IsString()
  @IsNotEmpty()
  username: string;

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

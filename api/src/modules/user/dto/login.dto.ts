import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '请输入账号' })
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @IsString()
  @IsNotEmpty({ message: '请输入密码' })
  @MinLength(6)
  @MaxLength(100)
  password: string;

  @IsString()
  @IsOptional()
  fingerprint?: string;
}

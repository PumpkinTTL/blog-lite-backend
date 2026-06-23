import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  @IsString()
  @IsNotEmpty()
  deviceId: string;
}

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

  // 设备 ID：前端生成（crypto.randomUUID），存 localStorage，续签时必须回传同一个。
  // 绝不能由后端 IP 派生——IP 会变，导致续签时 deviceId 不一致被鉴权中心拒绝。
  @IsString()
  @IsNotEmpty({ message: '设备标识缺失' })
  deviceId: string;

  // 浏览器指纹（FingerprintJS visitorId）：用于风控/审计，不参与续签判定。
  // 允许偶尔变化（浏览器更新/装插件），故为 Optional。
  @IsString()
  @IsOptional()
  fingerprint?: string;
}

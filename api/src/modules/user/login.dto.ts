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
  // 前端是 UUID(36 字符)；无上限时可灌任意大字符串进鉴权中心/Redis
  @MaxLength(128)
  deviceId: string;
}

export class LoginDto {
  // 登录凭证：id（纯数字）或 email。username 概念已移除。
  // 字段名 account 对应前端的"账号"输入框语义。
  @IsString()
  @IsNotEmpty({ message: '请输入账号' })
  @MinLength(1)
  @MaxLength(100)
  account: string;

  @IsString()
  @IsNotEmpty({ message: '请输入密码' })
  @MinLength(6)
  @MaxLength(100)
  password: string;

  // 设备 ID：前端生成（crypto.randomUUID），存 localStorage，续签时必须回传同一个。
  // 绝不能由后端 IP 派生——IP 会变，导致续签时 deviceId 不一致被鉴权中心拒绝。
  @IsString()
  @IsNotEmpty({ message: '设备标识缺失' })
  @MaxLength(128)
  deviceId: string;

  // 浏览器指纹（FingerprintJS visitorId）：用于风控/审计，不参与续签判定。
  // 允许偶尔变化（浏览器更新/装插件），故为 Optional。
  @IsString()
  @IsOptional()
  fingerprint?: string;

  // Turnstile 人机验证 token（开关开启时必填，由全局 TurnstileGuard 校验）
  @IsString()
  @IsOptional()
  turnstileToken?: string;
}

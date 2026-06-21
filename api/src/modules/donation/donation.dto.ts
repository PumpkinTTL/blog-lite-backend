import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsEnum,
  Min,
  MaxLength,
  IsArray,
  IsInt,
  IsDateString,
  IsBoolean,
  IsEmail,
} from 'class-validator';
import type {
  PayMethod,
  CryptoNetwork,
  DonationStatus,
} from './donation.entity';

export class CreateDonationDto {
  @IsString()
  @MaxLength(50)
  donorName: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  donorAvatar?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  donorEmail?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  currency?: string;

  @IsEnum(['wechat', 'alipay', 'crypto', 'other'])
  payMethod: PayMethod;

  @IsEnum(['TRC20', 'BSC', 'POL'])
  @IsOptional()
  cryptoNetwork?: CryptoNetwork;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  cryptoTxHash?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  cryptoFrom?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  cryptoTo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  message?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  tradeNo?: string;

  @IsIn([0, 1, 2])
  @IsOptional()
  status?: DonationStatus;

  @IsIn([0, 1])
  @IsOptional()
  isVisible?: number;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  remark?: string;
}

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

/**
 * 发送感谢（统一入口）
 * - codeId：可选，带码感谢（发激活码）；不带则纯感谢邮件
 * - email：收件邮箱（缺省用捐赠记录的 donorEmail），后端据此反查系统用户锁归属
 * - message：可选附加留言
 * - sendEmail：是否邮件通知（false 则只记录不发邮件，用于线下转交）
 */
export class SendThanksDto {
  @IsInt()
  @IsOptional()
  codeId?: number;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  message?: string;

  @IsBoolean()
  @IsOptional()
  sendEmail?: boolean;
}

export class UpdateDonationDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  donorName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  donorAvatar?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  donorEmail?: string;

  @IsNumber()
  @IsOptional()
  @Min(0.01)
  amount?: number;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  currency?: string;

  @IsEnum(['wechat', 'alipay', 'crypto', 'other'])
  @IsOptional()
  payMethod?: PayMethod;

  @IsEnum(['TRC20', 'BSC', 'POL'])
  @IsOptional()
  cryptoNetwork?: CryptoNetwork;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  cryptoTxHash?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  cryptoFrom?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  cryptoTo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  message?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  tradeNo?: string;

  @IsIn([0, 1, 2])
  @IsOptional()
  status?: DonationStatus;

  @IsIn([0, 1])
  @IsOptional()
  isVisible?: number;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  remark?: string;
}

import { IsString, IsOptional, IsNumber, IsIn, IsEnum, Min, MaxLength } from 'class-validator';
import type { PayMethod, CryptoNetwork, DonationStatus } from './donation.entity';

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

import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsEnum,
  Matches,
  Min,
  Max,
  MaxLength,
  IsArray, ArrayMaxSize,
  IsInt,
  IsBoolean,
  IsEmail,
} from 'class-validator';
import type {
  PayMethod,
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
  // 上限 1 亿，防止公开接口提交超大金额导致捐赠墙 SUM 精度溢出/前端 Infinity
  @Max(100000000)
  amount: number;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  currency?: string;

  @IsEnum(['wechat', 'alipay', 'crypto', 'other'])
  payMethod: PayMethod;

  // 链名由后台「捐赠配置→钱包地址」的键驱动（可配任意链），
  // 放宽为受控字符串：仅作捐赠登记元数据展示，白名单枚举会把新链全部 400
  @IsString()
  @MaxLength(24)
  @Matches(/^[A-Za-z0-9_-]+$/)
  @IsOptional()
  cryptoNetwork?: string;

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

  @IsIn(['pending', 'confirmed', 'refunded'])
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
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  ids: number[];
}

/**
 * 发送感谢（统一入口）
 * - codeId：可选，带码感谢（发激活码）；不带则纯感谢邮件
 * - email：收件邮箱（缺省用捐赠记录的 donorEmail），后端据此反查系统用户锁归属
 * - message：可选管理员留言（浅琥珀底块）
 * - contact：可选联系方式（不传则不显示"如有疑问"段）
 * - platformName：可选平台名（默认 bitlesu）
 * - tagline：可选署名寄语（默认"每一篇文章都是生活与阅读的深度思考"）
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

  @IsString()
  @IsOptional()
  contact?: string;

  @IsString()
  @IsOptional()
  platformName?: string;

  @IsString()
  @IsOptional()
  tagline?: string;

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

  // 链名由后台「捐赠配置→钱包地址」的键驱动（可配任意链），
  // 放宽为受控字符串：仅作捐赠登记元数据展示，白名单枚举会把新链全部 400
  @IsString()
  @MaxLength(24)
  @Matches(/^[A-Za-z0-9_-]+$/)
  @IsOptional()
  cryptoNetwork?: string;

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

  @IsIn(['pending', 'confirmed', 'refunded'])
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

/**
 * 前台用户自助提交捐赠登记。
 * 关键：不允许用户自己设 status / isVisible / sortOrder / remark 等管理字段，
 * 后端强制 status=pending（待管理员确认到账）、isVisible=0（确认前不上墙）。
 */
export class PublicSubmitDonationDto {
  @IsString()
  @MaxLength(50)
  donorName: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  donorEmail?: string;

  @IsNumber()
  @Min(0.01)
  // 上限 1 亿，防止公开接口提交超大金额导致捐赠墙 SUM 精度溢出/前端 Infinity
  @Max(100000000)
  amount: number;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  currency?: string;

  @IsEnum(['wechat', 'alipay', 'crypto', 'other'])
  payMethod: PayMethod;

  // 链名由后台「捐赠配置→钱包地址」的键驱动（可配任意链），
  // 放宽为受控字符串：仅作捐赠登记元数据展示，白名单枚举会把新链全部 400
  @IsString()
  @MaxLength(24)
  @Matches(/^[A-Za-z0-9_-]+$/)
  @IsOptional()
  cryptoNetwork?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  cryptoTxHash?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  message?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  tradeNo?: string;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PayMethod = 'wechat' | 'alipay' | 'crypto' | 'other';
export type CryptoNetwork = 'TRC20' | 'BSC' | 'POL' | null;
export type DonationStatus = 'pending' | 'confirmed' | 'refunded';

@Entity('donations')
export class DonationEntity {
  @PrimaryGeneratedColumn({ comment: '捐赠 ID' })
  id: number;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'donor_name',
    comment: '捐赠者昵称',
  })
  donorName: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'donor_avatar',
    comment: '捐赠者头像 URL',
  })
  donorAvatar: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'donor_email',
    comment: '捐赠者邮箱',
  })
  donorEmail: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '捐赠金额' })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'CNY', comment: '币种' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'pay_method',
    comment: '支付方式: wechat/alipay/crypto/other',
  })
  payMethod: PayMethod;

  // ── 加密货币字段 ──

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'crypto_network',
    comment: '加密货币网络: TRC20/BSC/POL',
  })
  cryptoNetwork: CryptoNetwork;

  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
    name: 'crypto_tx_hash',
    comment: '链上交易哈希',
  })
  cryptoTxHash: string | null;

  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
    name: 'crypto_from',
    comment: '发送方钱包地址',
  })
  cryptoFrom: string | null;

  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
    name: 'crypto_to',
    comment: '接收方钱包地址',
  })
  cryptoTo: string | null;

  // ── 通用字段 ──

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '捐赠者留言',
  })
  message: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'trade_no',
    comment: '第三方交易流水号',
  })
  tradeNo: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'confirmed',
    comment: '状态: pending=待确认 confirmed=已确认 refunded=已退款',
  })
  status: DonationStatus;

  @Column({
    type: 'tinyint',
    default: 1,
    name: 'is_visible',
    comment: '是否在捐赠墙展示: 1=展示 0=隐藏',
  })
  isVisible: number;

  @Column({ type: 'int', default: 0, name: 'sort_order', comment: '排序权重' })
  sortOrder: number;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '管理员备注',
  })
  remark: string | null;

  @Column({
    type: 'int',
    nullable: true,
    name: 'reward_code_id',
    comment: '捐赠答谢激活码 ID（关联 codes.id，null=未发码）',
  })
  rewardCodeId: number | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}

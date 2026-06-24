import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 广告投放位置
 * - sidebar：首页/文章页侧边栏（竖向小卡片）
 * - popup：首页 Modal 弹窗（全屏，可自动关闭）
 * - popup_toast：右下角浮窗（轻量滑入）
 */
export type AdPosition = 'sidebar' | 'popup' | 'popup_toast';

/** 广告样式类型（当前仅 card，预留扩展） */
export type AdType = 'card';

/** 广告状态（active=投放中 inactive=已暂停） */
export type AdStatus = 'active' | 'inactive';

/**
 * ads 表索引：
 * - (position, status)：公开查询热路径 WHERE position=? AND status='active'
 * - sortOrder：同位置内排序
 * - createdAt：管理端默认排序
 */
@Entity('ads')
@Index('idx_ad_position_status', ['position', 'status'])
@Index('idx_ad_sort', ['sortOrder'])
@Index('idx_ad_created', ['createdAt'])
export class AdEntity {
  @PrimaryGeneratedColumn({ comment: '广告 ID' })
  id: number;

  @Column({ type: 'varchar', length: 100, comment: '标题（用户可见）' })
  title: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '副标题/描述（用户可见）',
  })
  subtitle: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'image_url',
    comment: '封面图 URL',
  })
  imageUrl: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: '了解详情',
    name: 'button_text',
    comment: 'CTA 按钮文字',
  })
  buttonText: string;

  @Column({
    type: 'varchar',
    length: 500,
    comment: '跳转链接（邀请码隐式拼在此）',
  })
  href: string;

  @Column({
    type: 'varchar',
    length: 20,
    comment: "投放位置: sidebar/popup/popup_toast",
  })
  position: AdPosition;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'card',
    comment: '样式类型（当前仅 card，预留扩展）',
  })
  type: AdType;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'inactive',
    comment: '状态: active=投放中 inactive=已暂停',
  })
  status: AdStatus;

  @Column({
    type: 'datetime',
    nullable: true,
    name: 'start_at',
    comment: '排期开始（null=立即生效）',
  })
  startAt: Date | null;

  @Column({
    type: 'datetime',
    nullable: true,
    name: 'end_at',
    comment: '排期结束（null=永久）',
  })
  endAt: Date | null;

  @Column({ type: 'int', default: 0, name: 'sort_order', comment: '同位置内排序权重（小在前）' })
  sortOrder: number;

  @Column({ type: 'int', default: 0, comment: '曝光计数' })
  impressions: number;

  @Column({ type: 'int', default: 0, comment: '点击计数' })
  clicks: number;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'admin_note',
    comment: '后台备注（含收益说明，不对用户展示）',
  })
  adminNote: string | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ResourceCategoryEntity } from '../resource-category/resource-category.entity';
import { UserEntity } from '../user/user.entity';

/**
 * 网盘链接项
 * name: 网盘名称（夸克/百度/蓝奏云/自定义）
 * url:  分享链接
 * code: 提取码（可选）
 */
export interface PanLink {
  name: string;
  url: string;
  code?: string | null;
}

@Entity('resources')
@Index('idx_resource_status', ['status'])
@Index('idx_resource_sort', ['sortOrder'])
@Index('idx_resource_category', ['categoryId'])
@Index('idx_resource_uploader', ['uploaderId'])
// 公开资源列表默认 ORDER BY sortOrder ASC, createdAt DESC；idx_resource_sort 单列只能排第一级
@Index('idx_resource_sort_created', ['sortOrder', 'createdAt'])
export class ResourceEntity {
  @PrimaryGeneratedColumn({ comment: '资源 ID' })
  id: number;

  @Column({ type: 'varchar', length: 200, comment: '标题' })
  title: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '副标题/简介' })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '封面图 URL' })
  cover: string | null;

  @Column({
    type: 'int',
    nullable: true,
    name: 'category_id',
    comment: '资源分类 ID',
  })
  categoryId: number | null;

  @ManyToOne(() => ResourceCategoryEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: ResourceCategoryEntity | null;

  /** 上传者（作者），用于前端资源卡片展示 */
  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploader_id' })
  uploader: UserEntity | null;

  @Column({
    type: 'int',
    nullable: true,
    name: 'uploader_id',
    comment: '上传者用户 ID',
  })
  uploaderId: number | null;

  @Column({ type: 'text', nullable: true, comment: '资源详细说明（富文本）' })
  content: string | null;

  /**
   * 网盘链接数组 [{ name, url, code }] —— 敏感内容
   * 仅对有权访问的用户返回，列表端点永不返回
   */
  @Column({ type: 'json', nullable: true, name: 'pan_links', comment: '网盘链接 JSON 数组' })
  panLinks: PanLink[] | null;

  /**
   * 价格（分），0 = 免费 / 仅兑换码解锁
   * 仅展示用，支付链路未实现，购买流程后续接入
   */
  @Column({ type: 'int', default: 0, name: 'price_cents', comment: '价格（分），0=免费' })
  priceCents: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'draft',
    comment: '状态 draft=草稿 published=公开 login=登录可见 private=指定可见',
  })
  status: string;

  /**
   * 最低会员等级（null=不限，'plus'/'pro'/'max'）
   * 【已废弃】改用 allowedRoleIds 判定。列保留以兼容旧数据，不再参与校验。
   */
  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'min_member_level',
    comment: '【已废弃】最低会员等级，改用 allowedRoleIds',
  })
  minMemberLevel: string | null;

  /**
   * 解锁所需的角色组 ID 列表（null/空 = 无门槛，公开可访问）。
   * 用户角色与该列表有任一交集即可解锁（OR 关系）。
   * 这是资源权益判定的依据（角色驱动），取代旧的 minMemberLevel。
   * 注意：与 private 资源的 entity_visibility.allowedRoleIds 是两套机制——
   *       本字段是"会员权益门槛"，那个是"私有资源的白名单"。
   */
  @Column({
    type: 'json',
    nullable: true,
    name: 'required_role_ids',
    comment: '解锁所需的角色组 ID 列表（空=无门槛）',
  })
  requiredRoleIds: number[] | null;

  @Column({ type: 'int', default: 0, name: 'view_count', comment: '浏览数' })
  viewCount: number;

  @Column({ type: 'int', default: 0, name: 'sort_order', comment: '排序权重' })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}

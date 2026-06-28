import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { RoleEntity } from './role.entity';
import { CodeEntity } from '../code/code.entity';

/**
 * users 表索引：
 * - email 是 unique（隐式索引）
 * - status：管理端过滤（findAll 的 exact filter + 临时封禁检查）
 * - createdAt：管理端列表排序（orderBy createdAt DESC）
 *
 * 设计说明：已移除 username 列。对外展示用 nickname（昵称，可中文/重名），
 * 唯一标识/查询用 id（JWT 凭证即 id），登录凭证用 id 或 email。
 * 登录账号的概念不再存在——用户记 id 或邮箱即可。
 */
@Entity('users')
@Index('idx_user_status', ['status'])
@Index('idx_user_created', ['createdAt'])
export class UserEntity {
  // 非自增主键：注册时由 generateUniqueUserId() 生成 9 位随机数字赋值。
  // 目的：防推算注册顺序/用户总量、防爬虫遍历。详见 common/utils/generate-user-id.ts。
  @PrimaryColumn({ type: 'bigint', comment: '用户 ID（9位随机数字）' })
  id: number;

  @Column({ length: 255, select: false, comment: '密码哈希' })
  password: string;

  @Column({ length: 50, comment: '显示昵称' })
  nickname: string;

  @Index('uq_user_email', { unique: true })
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: '邮箱（唯一，可为空）',
  })
  email: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '头像 URL' })
  avatar: string | null;

  /**
   * 性别：0=未知 1=男 2=女。
   * 用户可选填，前端 UserCenter 资料页编辑。
   */
  @Column({ type: 'int', nullable: true, default: 0, comment: '性别 0=未知 1=男 2=女' })
  gender: number | null;

  /**
   * 个性签名：用户在 UserCenter 资料页填写，资料卡/评论侧栏展示。
   */
  @Column({ type: 'varchar', length: 200, nullable: true, comment: '个性签名' })
  signature: string | null;

  /**
   * 手机号：nullable，预留未来手机号登录/绑定。当前仅资料展示。
   */
  @Column({ type: 'varchar', length: 20, nullable: true, comment: '手机号' })
  phone: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
    comment: '状态 active=正常 disabled=禁用',
  })
  status: string;

  /**
   * 封禁截止时间：
   * - null 且 status=active → 未封禁
   * - null 且 status=disabled → 永久封禁
   * - 有值且 status=disabled → 临时封禁，过期后由 AuthGuard 惰性解封
   */
  @Column({
    type: 'datetime',
    nullable: true,
    name: 'banned_until',
    comment: '封禁截止时间（null=未封禁或永久封禁）',
  })
  bannedUntil: Date | null;

  @Column({
    type: 'int',
    nullable: true,
    name: 'register_code_id',
    comment: '注册时使用的邀请码ID',
  })
  registerCodeId: number | null;

  @Column({
    type: 'varchar',
    length: 45,
    nullable: true,
    name: 'register_ip',
    comment: '注册IP',
  })
  registerIp: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    name: 'register_source',
    comment: '注册来源',
  })
  registerSource: string | null;

  @Column({
    type: 'datetime',
    nullable: true,
    name: 'last_login_at',
    comment: '最后登录时间',
  })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;

  @ManyToMany(() => RoleEntity, (role) => role.users)
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles: RoleEntity[];

  // 外键关联到 codes 表
  @ManyToOne(() => CodeEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'register_code_id' })
  registerCode: CodeEntity;
}

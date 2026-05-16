import {
  Entity,
  PrimaryGeneratedColumn,
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

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn({ comment: '用户 ID' })
  id: number;

  @Column({ length: 50, unique: true, comment: '登录账号' })
  username: string;

  @Column({ length: 255, select: false, comment: '密码哈希' })
  password: string;

  @Column({ length: 50, comment: '显示昵称' })
  nickname: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '邮箱' })
  email: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '头像 URL' })
  avatar: string | null;

  @Column({ type: 'tinyint', default: 1, comment: '状态 1=正常 0=禁用' })
  status: number;

  @Column({ type: 'int', nullable: true, name: 'register_code_id', comment: '注册时使用的邀请码ID' })
  registerCodeId: number | null;

  @Column({ type: 'varchar', length: 45, nullable: true, name: 'register_ip', comment: '注册IP' })
  registerIp: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'register_source', comment: '注册来源' })
  registerSource: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'last_login_at', comment: '最后登录时间' })
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

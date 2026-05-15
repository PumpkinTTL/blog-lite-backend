import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { RoleEntity } from './role.entity';

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
}

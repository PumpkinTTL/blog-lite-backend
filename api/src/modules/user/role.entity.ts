import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('roles')
export class RoleEntity {
  @PrimaryGeneratedColumn({ comment: '角色 ID' })
  id: number;

  @Column({ length: 50, unique: true, comment: '角色标识' })
  name: string;

  @Column({ length: 50, name: 'display_name', comment: '显示名称' })
  displayName: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '描述' })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @ManyToMany(() => UserEntity, (user) => user.roles)
  users: UserEntity[];
}

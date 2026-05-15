import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('settings')
export class SettingEntity {
  @PrimaryGeneratedColumn({ comment: 'ID' })
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true, comment: '配置键' })
  key: string;

  @Column({ type: 'text', comment: '配置值' })
  value: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '说明' })
  description: string | null;

  @Column({ type: 'varchar', length: 50, default: 'general', comment: '分组' })
  group: string;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}

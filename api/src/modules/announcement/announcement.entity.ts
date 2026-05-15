import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('announcements')
export class AnnouncementEntity {
  @PrimaryGeneratedColumn({ comment: '公告 ID' })
  id: number;

  @Column({ type: 'varchar', length: 200, comment: '标题' })
  title: string;

  @Column({ type: 'text', comment: '内容' })
  content: string;

  @Column({ type: 'tinyint', default: 1, comment: '状态 1=显示 0=隐藏' })
  status: number;

  @Column({ type: 'int', default: 0, name: 'sort_order', comment: '排序权重' })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PostEntity } from '../post/post.entity';

@Entity('friend_links')
@Index('uq_friendlink_name', ['name'], { unique: true })
@Index('idx_friendlink_status', ['status'])
@Index('idx_friendlink_sort', ['sortOrder'])
export class FriendLinkEntity {
  @PrimaryGeneratedColumn({ comment: '友链 ID' })
  id: number;

  @Column({ type: 'varchar', length: 100, comment: '站点名称' })
  name: string;

  @Column({ type: 'varchar', length: 500, comment: '站点 URL' })
  url: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: 'Logo URL' })
  logo: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '描述' })
  description: string | null;

  @Column({ type: 'int', default: 0, name: 'sort_order', comment: '排序权重' })
  sortOrder: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'visible',
    comment: '状态 visible=显示 hidden=隐藏',
  })
  status: string;

  @Column({
    type: 'int',
    nullable: true,
    name: 'post_id',
    comment: '关联文章 ID，null=全局',
  })
  postId: number | null;

  @ManyToOne(() => PostEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'post_id' })
  post: PostEntity | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PostEntity } from './post.entity';

@Entity('post_views')
@Index('idx_postview_post', ['postId'])
@Index('idx_postview_viewed', ['viewedAt'])
// 浏览去重热路径：findOne({ where: { postId, ip } }) 每次浏览都跑，复合索引变单次定位
@Index('idx_postview_post_ip', ['postId', 'ip'])
export class PostViewEntity {
  @PrimaryGeneratedColumn({ comment: 'ID' })
  id: number;

  @Column({ name: 'post_id', comment: '文章 ID' })
  postId: number;

  @ManyToOne(() => PostEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: PostEntity;

  @Column({ type: 'varchar', length: 45, comment: '访问者 IP' })
  ip: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'user_agent',
    comment: '浏览器 UA',
  })
  userAgent: string | null;

  @Column({
    type: 'bigint',
    nullable: true,
    name: 'user_id',
    comment: '登录用户 ID（9位随机，与 users.id 对齐）',
  })
  userId: number | null;

  @CreateDateColumn({ name: 'viewed_at', comment: '访问时间' })
  viewedAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PostEntity } from './post.entity';

@Entity('post_views')
export class PostViewEntity {
  @PrimaryGeneratedColumn({ comment: 'ID' })
  id: number;

  @Column({ name: 'post_id', comment: '文章 ID' })
  postId: number;

  @ManyToOne(() => PostEntity)
  @JoinColumn({ name: 'post_id' })
  post: PostEntity;

  @Column({ type: 'varchar', length: 45, comment: '访问者 IP' })
  ip: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'user_agent', comment: '浏览器 UA' })
  userAgent: string | null;

  @Column({ type: 'int', nullable: true, name: 'user_id', comment: '登录用户 ID' })
  userId: number | null;

  @CreateDateColumn({ name: 'viewed_at', comment: '访问时间' })
  viewedAt: Date;
}

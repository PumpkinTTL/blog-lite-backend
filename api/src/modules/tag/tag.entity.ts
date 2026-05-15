import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
} from 'typeorm';
import { PostEntity } from '../post/post.entity';

@Entity('tags')
export class TagEntity {
  @PrimaryGeneratedColumn({ comment: '标签 ID' })
  id: number;

  @Column({ type: 'varchar', length: 30, unique: true, comment: '标签名称' })
  name: string;

  @Column({ type: 'varchar', length: 30, unique: true, comment: 'URL slug' })
  slug: string;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @ManyToMany(() => PostEntity, (post) => post.tags)
  posts: PostEntity[];
}

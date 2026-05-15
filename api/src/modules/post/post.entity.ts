import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { CategoryEntity } from '../category/category.entity';
import { TagEntity } from '../tag/tag.entity';

@Entity('posts')
export class PostEntity {
  @PrimaryGeneratedColumn({ comment: '文章 ID' })
  id: number;

  @Column({ type: 'varchar', length: 200, comment: '标题' })
  title: string;

  @Column({ type: 'varchar', length: 200, unique: true, comment: 'URL slug' })
  slug: string;

  @Column({ type: 'text', comment: '正文内容' })
  content: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '摘要' })
  summary: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'cover_image', comment: '封面图 URL' })
  coverImage: string | null;

  @Column({ type: 'tinyint', default: 0, comment: '状态 0=草稿 1=已发布' })
  status: number;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'author_id' })
  author: UserEntity;

  @Column({ name: 'author_id', comment: '作者 ID' })
  authorId: number;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_id' })
  category: CategoryEntity | null;

  @Column({ type: 'int', nullable: true, name: 'category_id', comment: '分类 ID' })
  categoryId: number | null;

  @ManyToMany(() => TagEntity, (tag) => tag.posts)
  @JoinTable({
    name: 'post_tags',
    joinColumn: { name: 'post_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: TagEntity[];

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;

  @Column({ type: 'datetime', nullable: true, name: 'published_at', comment: '发布时间' })
  publishedAt: Date | null;
}

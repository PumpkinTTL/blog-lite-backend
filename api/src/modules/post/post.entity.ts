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
  Index,
} from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { CategoryEntity } from '../category/category.entity';
import { TagEntity } from '../tag/tag.entity';

@Entity('posts')
@Index('idx_post_author', ['authorId'])
@Index('idx_post_category', ['categoryId'])
@Index('idx_post_status', ['status'])
@Index('idx_post_created', ['createdAt'])
@Index('idx_post_deleted', ['deletedAt'])
@Index('idx_post_published', ['publishedAt'])
export class PostEntity {
  @PrimaryGeneratedColumn({ comment: '文章 ID' })
  id: number;

  @Column({ type: 'varchar', length: 200, comment: '标题' })
  title: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '副标题' })
  subtitle: string | null;

  @Column({ type: 'varchar', length: 200, unique: true, comment: 'URL slug' })
  slug: string;

  @Column({ type: 'text', comment: '正文内容' })
  content: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '摘要' })
  summary: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'cover_image',
    comment: '封面图 URL',
  })
  coverImage: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'draft',
    comment:
      '状态 draft=草稿 published=公开 login=登录可见 private=指定用户可见',
  })
  status: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'author_id' })
  author: UserEntity;

  @Column({ name: 'author_id', comment: '作者 ID' })
  authorId: number;

  @ManyToOne(() => CategoryEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: CategoryEntity | null;

  @Column({
    type: 'int',
    nullable: true,
    name: 'category_id',
    comment: '分类 ID',
  })
  categoryId: number | null;

  @ManyToMany(() => TagEntity, (tag) => tag.posts)
  @JoinTable({
    name: 'post_tags',
    joinColumn: { name: 'post_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: TagEntity[];

  // 注意：allowedUsers / allowedRoles 关系已迁移到 entity_visibility 多态表
  // 不在 entity 上声明关系，由 PostService 通过 EntityVisibilityService 管理

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;

  @Column({
    type: 'datetime',
    nullable: true,
    name: 'published_at',
    comment: '发布时间',
  })
  publishedAt: Date | null;

  @Column({ type: 'int', default: 0, name: 'view_count', comment: '阅读量' })
  viewCount: number;

  @Column({
    type: 'int',
    default: 0,
    name: 'like_count',
    comment: '点赞数（冗余缓存）',
  })
  likeCount: number;

  @Column({
    type: 'int',
    default: 0,
    name: 'favorite_count',
    comment: '收藏数（冗余缓存）',
  })
  favoriteCount: number;

  @Column({
    type: 'int',
    default: 0,
    name: 'comment_count',
    comment: '评论数（冗余缓存，仅算 approved）',
  })
  commentCount: number;

  @Column({
    type: 'datetime',
    nullable: true,
    name: 'deleted_at',
    comment: '软删除时间',
  })
  deletedAt: Date | null;

  @Column({
    type: 'boolean',
    default: false,
    name: 'is_pinned',
    comment: '是否置顶',
  })
  isPinned: boolean;
}

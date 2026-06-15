import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';

@Entity('categories')
@Index('uq_category_name', ['name'], { unique: true })
@Index('idx_category_parent', ['parentId'])
@Index('idx_category_sort', ['sortOrder'])
export class CategoryEntity {
  @PrimaryGeneratedColumn({ comment: '分类 ID' })
  id: number;

  @Column({ type: 'varchar', length: 50, comment: '分类名称' })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true, comment: 'URL slug' })
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '描述' })
  description: string | null;

  @Column({ type: 'int', default: 0, name: 'sort_order', comment: '排序权重' })
  sortOrder: number;

  @ManyToOne(() => CategoryEntity, (cat) => cat.children, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: CategoryEntity | null;

  @Column({
    type: 'int',
    nullable: true,
    name: 'parent_id',
    comment: '父分类 ID',
  })
  parentId: number | null;

  @OneToMany(() => CategoryEntity, (cat) => cat.parent)
  children: CategoryEntity[];

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;
}

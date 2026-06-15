import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('resource_categories')
@Index('uq_rescat_name', ['name'], { unique: true })
@Index('idx_rescat_sort', ['sortOrder'])
export class ResourceCategoryEntity {
  @PrimaryGeneratedColumn({ comment: '资源分类 ID' })
  id: number;

  @Column({ type: 'varchar', length: 50, comment: '分类名称' })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '描述' })
  description: string | null;

  @Column({ type: 'int', default: 0, name: 'sort_order', comment: '排序权重' })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;
}

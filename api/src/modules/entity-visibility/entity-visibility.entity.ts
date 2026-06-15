import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * 通用多态可见性表
 *
 * 通过 entityType + entityId 多态关联到任意资源（post/announcement/...）
 * 通过 subjectType + subjectId 标识可见对象（user=直接授权用户 / role=授权角色）
 *
 * 判定逻辑：
 *  - 直接授权：subjectType='user', subjectId=userId
 *  - 角色授权：subjectType='role', subjectId=roleId（用户拥有该角色即可见）
 */
export type VisibilitySubjectType = 'user' | 'role';

@Entity('entity_visibility')
@Unique('uq_entity_visibility', [
  'entityType',
  'entityId',
  'subjectType',
  'subjectId',
])
@Index('idx_ev_entity', ['entityType', 'entityId'])
@Index('idx_ev_subject', ['subjectType', 'subjectId'])
export class EntityVisibilityEntity {
  @PrimaryGeneratedColumn({ comment: 'ID' })
  id: number;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'entity_type',
    comment: '实体类型：post/announcement/...',
  })
  entityType: string;

  @Column({ type: 'int', name: 'entity_id', comment: '实体 ID' })
  entityId: number;

  @Column({
    type: 'varchar',
    length: 10,
    name: 'subject_type',
    comment: '主体类型：user/role',
  })
  subjectType: VisibilitySubjectType;

  @Column({
    type: 'int',
    name: 'subject_id',
    comment: '主体 ID（用户 ID 或角色 ID）',
  })
  subjectId: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;
}

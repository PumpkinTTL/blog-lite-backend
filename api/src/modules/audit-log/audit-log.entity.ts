import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type AuditTargetType =
  | 'user'
  | 'post'
  | 'setting'
  | 'code'
  | 'plan'
  | 'membership'
  | 'comment'
  | 'media'
  | 'category'
  | 'tag';

@Entity('audit_logs')
@Index(['targetType', 'targetId'])
@Index(['createdAt'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 32 }) targetType: AuditTargetType;
  @Column({ type: 'int' }) targetId: number;
  @Column({ type: 'varchar', length: 64 }) field: string;
  @Column({ type: 'text', nullable: true }) oldValue: string | null;
  @Column({ type: 'text', nullable: true }) newValue: string | null;
  @Column({ type: 'int', nullable: true }) operatorId: number | null;
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'target_name' })
  targetName: string | null;
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'operator_name',
  })
  operatorName: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) note: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

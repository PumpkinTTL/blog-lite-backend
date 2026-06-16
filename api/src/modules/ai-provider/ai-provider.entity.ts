import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { AiModelEntity } from '../ai-model/ai-model.entity';

/**
 * AI 提供商实体（如 9router、openai、anthropic 等）。
 * 存储接入某个 OpenAI 兼容网关所需的连接信息。
 */
@Entity('ai_providers')
@Index('idx_ai_provider_status', ['status'])
export class AiProviderEntity {
  @PrimaryGeneratedColumn({ comment: '提供商 ID' })
  id: number;

  @Column({ type: 'varchar', length: 50, comment: '名称' })
  name: string;

  @Column({ type: 'varchar', length: 200, comment: 'Base URL' })
  baseUrl: string;

  @Column({ type: 'varchar', length: 200, comment: 'API Key（明文）' })
  apiKey: string;

  @Column({ type: 'varchar', length: 50, default: 'openai', comment: '协议' })
  protocol: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ type: 'tinyint', default: 1, comment: '状态：1 启用 0 禁用' })
  status: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;

  @OneToMany(() => AiModelEntity, (m) => m.provider)
  models: AiModelEntity[];
}

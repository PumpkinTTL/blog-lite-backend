import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AiProviderEntity } from '../ai-provider/ai-provider.entity';

/**
 * AI 模型实体。归属某个 Provider，记录模型标识和参数限制。
 * 如 cmc/deepseek/deepseek-v4-flash 归属 9router。
 */
@Entity('ai_models')
@Index('idx_ai_model_provider', ['providerId'])
@Index('idx_ai_model_status', ['status'])
export class AiModelEntity {
  @PrimaryGeneratedColumn({ comment: '模型 ID' })
  id: number;

  @Column({ name: 'provider_id', type: 'int', comment: '所属提供商 ID' })
  providerId: number;

  /** 模型标识（发给网关用的，如 cmc/deepseek/deepseek-v4-flash） */
  @Column({ type: 'varchar', length: 200, comment: '模型标识' })
  modelId: string;

  /** 展示名（给用户看的，如 DeepSeek V4 Flash） */
  @Column({ type: 'varchar', length: 100, comment: '展示名' })
  displayName: string;

  /** 上下文窗口 token 数 */
  @Column({ type: 'int', default: 32000, comment: '最大上下文 token' })
  maxContextTokens: number;

  /** 单次输出 token 上限 */
  @Column({ type: 'int', default: 4096, comment: '单次最大输出 token' })
  maxOutputTokens: number;

  /** 是否支持 function calling / tools */
  @Column({ type: 'tinyint', default: 1, comment: '是否支持工具调用' })
  supportsTools: number;

  /** 是否支持思考过程（reasoning_content） */
  @Column({ type: 'tinyint', default: 0, comment: '是否支持思考过程' })
  supportsThinking: number;

  @Column({ type: 'tinyint', default: 1, comment: '状态：1 启用 0 禁用' })
  status: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;

  @ManyToOne(() => AiProviderEntity, (p) => p.models)
  @JoinColumn({ name: 'provider_id' })
  provider: AiProviderEntity;
}

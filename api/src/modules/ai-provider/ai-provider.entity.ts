import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 单个模型的定义（嵌入 provider 的 JSON 数组元素）。
 * modelId 是发给网关的标识，displayName 是给用户看的名字。
 */
export interface AiProviderModel {
  /** 模型标识（发给网关用，如 cmc/deepseek/deepseek-v4-flash） */
  modelId: string;
  /** 展示名（给用户看，如 DeepSeek V4 Flash） */
  displayName: string;
  /** 最大上下文 token */
  maxContextTokens?: number;
  /** 单次最大输出 token */
  maxOutputTokens?: number;
  /** 是否支持 function calling / tools */
  supportsTools?: boolean;
  /** 是否支持思考过程（reasoning_content） */
  supportsThinking?: boolean;
}

/**
 * AI 提供商实体（如 9router、openai、anthropic 等）。
 * 存储接入某个 OpenAI 兼容网关所需的连接信息。
 * 模型列表以 JSON 数组嵌入 models 字段，无需独立表。
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

  /**
   * 模型列表（JSON 数组）。每项是 { modelId, displayName, maxContextTokens, ... }。
   * 用 longtext 容纳较多模型定义；MySQL 经 utf8mb4 转换后自动序列化/反序列化。
   */
  @Column({
    type: 'longtext',
    comment: '模型列表 JSON',
    transformer: {
      to: (value: AiProviderModel[] | null): string =>
        value && value.length > 0 ? JSON.stringify(value) : '[]',
      from: (value: string | null): AiProviderModel[] => {
        if (!value) return [];
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      },
    },
  })
  models: AiProviderModel[];

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ type: 'tinyint', default: 1, comment: '状态：1 启用 0 禁用' })
  status: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}

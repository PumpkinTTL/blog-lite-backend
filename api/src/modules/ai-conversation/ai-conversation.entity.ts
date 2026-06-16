import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * AI 对话历史。一篇 post 对应一条记录，messages 存完整 JSON。
 * 设计：前端每次对话后把完整 messages 数组覆盖写回，下次加载即续接。
 */
@Entity('ai_conversations')
@Index('idx_ai_conv_post', ['postId'])
export class AiConversationEntity {
  @PrimaryGeneratedColumn({ comment: '对话 ID' })
  id: number;

  @Column({ name: 'post_id', type: 'int', comment: '关联文章 ID' })
  postId: number;

  /** 完整对话历史（OpenAI messages 格式的 JSON 字符串） */
  @Column({ type: 'longtext', comment: '对话消息 JSON' })
  messages: string;

  /** 使用的模型标识（冗余记录，便于管理页展示） */
  @Column({ type: 'varchar', length: 200, nullable: true, comment: '使用模型' })
  model: string | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}

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

  /** 累计输入 token（每轮 prompt_tokens 累加，持久化避免重开重新计算） */
  @Column({
    name: 'prompt_tokens',
    type: 'int',
    default: 0,
    comment: '累计输入 token',
  })
  promptTokens: number;

  /** 累计输出 token（每轮 completion_tokens 累加） */
  @Column({
    name: 'completion_tokens',
    type: 'int',
    default: 0,
    comment: '累计输出 token',
  })
  completionTokens: number;

  /** 对话轮次（每完成一轮 assistant 回复 +1） */
  @Column({
    name: 'rounds',
    type: 'int',
    default: 0,
    comment: '对话轮次',
  })
  rounds: number;

  /**
   * 最新历史压缩摘要（覆盖式）。
   * 业界标准：发给模型的上下文 = [system:本摘要] + 压缩点之后的新对话，
   * 而完整原始对话（messages）永不删除，供用户回看历史。
   * 未压缩过则为 null。
   */
  @Column({
    name: 'compaction_summary',
    type: 'longtext',
    nullable: true,
    comment: '最新历史压缩摘要',
  })
  compactionSummary: string | null;

  /**
   * 压缩点之后的新对话（JSON 字符串，发给模型用）。
   * 压缩时落库：[压缩前所有轮] 被摘要替换，这里从空数组开始累积新轮。
   * 未压缩过则为 null（表示直接用 messages）。
   */
  @Column({
    name: 'compaction_messages',
    type: 'longtext',
    nullable: true,
    comment: '压缩点之后的新对话JSON',
  })
  compactionMessages: string | null;

  /** 最近一次压缩时释放的 token（压缩前累计 - 压缩后基线） */
  @Column({
    name: 'compaction_tokens',
    type: 'int',
    default: 0,
    comment: '最近一次压缩释放的token',
  })
  compactionTokens: number;

  /** 最近一次压缩时间 */
  @Column({
    name: 'compacted_at',
    type: 'datetime',
    nullable: true,
    comment: '最近一次压缩时间',
  })
  compactedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { applyFilters } from '../../common/utils/apply-filters';
import { AiConversationEntity } from './ai-conversation.entity';
import { SaveConversationDto } from './ai-conversation.dto';

@Injectable()
export class AiConversationService {
  constructor(
    @InjectRepository(AiConversationEntity)
    private readonly repo: Repository<AiConversationEntity>,
  ) {}

  /** 管理页分页列表 */
  async findAll(
    page: number,
    pageSize: number,
    filters?: { id?: number; postId?: number },
  ) {
    const qb = this.repo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id, 'e.postId': filters?.postId },
    });
    qb.orderBy('e.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    // messages 是 JSON 字符串且较大：列表只返回消息条数，不展开整串。
    // 旧逻辑直接返回字符串导致前端 Array.isArray 判断为 false，消息数恒为 0。
    const dtoList = list.map((e) => {
      let messageCount = 0;
      if (e.messages) {
        try {
          const arr = JSON.parse(e.messages);
          if (Array.isArray(arr)) messageCount = arr.length;
        } catch {
          // 解析失败算 0，不阻断列表
        }
      }
      return {
        id: e.id,
        postId: e.postId,
        model: e.model,
        promptTokens: e.promptTokens ?? 0,
        completionTokens: e.completionTokens ?? 0,
        rounds: e.rounds ?? 0,
        compactionTokens: e.compactionTokens ?? 0,
        compactedAt: e.compactedAt ?? null,
        hasCompaction: e.compactionSummary != null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        messageCount,
      };
    });
    return { list: dtoList, total, page, pageSize };
  }

  /** 按文章 ID 读取对话历史（AgentPanel 加载用），不存在返回 null */
  async findByPostId(postId: number): Promise<AiConversationEntity | null> {
    return this.repo.findOne({ where: { postId } });
  }

  /** upsert：有则更新 messages + token 累计，无则新建 */
  async save(dto: SaveConversationDto): Promise<AiConversationEntity> {
    const messagesJson = JSON.stringify(dto.messages);
    let item = await this.repo.findOne({ where: { postId: dto.postId } });
    if (item) {
      item.messages = messagesJson;
      if (dto.model !== undefined) item.model = dto.model;
      // token / 轮次：前端传全量累计值直接覆盖（前端是唯一写入方）
      item.promptTokens = dto.promptTokens ?? item.promptTokens ?? 0;
      item.completionTokens = dto.completionTokens ?? item.completionTokens ?? 0;
      item.rounds = dto.rounds ?? item.rounds ?? 0;
      // 压缩字段
      if (dto.compactionSummary !== undefined) {
        item.compactionSummary = dto.compactionSummary ?? null;
      }
      if (dto.compactionMessages !== undefined) {
        item.compactionMessages = JSON.stringify(dto.compactionMessages);
      }
      if (dto.compactionTokens !== undefined) {
        item.compactionTokens = dto.compactionTokens ?? 0;
      }
      // 压缩时间：只要这次带了 compactionSummary 且与库里不同，认为发生了一次新压缩
      if (
        dto.compactionSummary !== undefined &&
        dto.compactionSummary !== item.compactionSummary
      ) {
        item.compactedAt = new Date();
      }
    } else {
      item = this.repo.create({
        postId: dto.postId,
        messages: messagesJson,
        model: dto.model ?? null,
        promptTokens: dto.promptTokens ?? 0,
        completionTokens: dto.completionTokens ?? 0,
        rounds: dto.rounds ?? 0,
        compactionSummary: dto.compactionSummary ?? null,
        compactionMessages: dto.compactionMessages
          ? JSON.stringify(dto.compactionMessages)
          : null,
        compactionTokens: dto.compactionTokens ?? 0,
        compactedAt:
          dto.compactionSummary !== undefined ? new Date() : null,
      });
    }
    return this.repo.save(item);
  }

  async findById(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`对话 #${id} 不存在`);
    return item;
  }

  async remove(id: number) {
    const item = await this.findById(id);
    await this.repo.remove(item);
    return item;
  }

  async removeByPostId(postId: number) {
    const item = await this.repo.findOne({ where: { postId } });
    if (item) await this.repo.remove(item);
    return item;
  }

  async batchRemove(ids: number[]) {
    const items = await this.repo.findByIds(ids);
    await this.repo.remove(items);
    return items;
  }
}

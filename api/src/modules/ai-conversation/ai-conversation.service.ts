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
    return { list, total, page, pageSize };
  }

  /** 按文章 ID 读取对话历史（AgentPanel 加载用），不存在返回 null */
  async findByPostId(postId: number): Promise<AiConversationEntity | null> {
    return this.repo.findOne({ where: { postId } });
  }

  /** upsert：有则更新 messages，无则新建 */
  async save(dto: SaveConversationDto): Promise<AiConversationEntity> {
    const messagesJson = JSON.stringify(dto.messages);
    let item = await this.repo.findOne({ where: { postId: dto.postId } });
    if (item) {
      item.messages = messagesJson;
      if (dto.model !== undefined) item.model = dto.model;
    } else {
      item = this.repo.create({
        postId: dto.postId,
        messages: messagesJson,
        model: dto.model ?? null,
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

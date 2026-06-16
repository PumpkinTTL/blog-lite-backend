import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { applyFilters } from '../../common/utils/apply-filters';
import { AiModelEntity } from './ai-model.entity';
import { CreateAiModelDto, UpdateAiModelDto } from './ai-model.dto';

@Injectable()
export class AiModelService {
  constructor(
    @InjectRepository(AiModelEntity)
    private readonly repo: Repository<AiModelEntity>,
  ) {}

  async findAll(
    page: number,
    pageSize: number,
    filters?: { id?: number; keyword?: string; status?: number; providerId?: number },
  ) {
    const qb = this.repo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: {
        'e.id': filters?.id,
        'e.status': filters?.status,
        'e.providerId': filters?.providerId,
      },
      like: { keyword: filters?.keyword, fields: ['e.modelId', 'e.displayName'] },
    });
    qb.leftJoinAndSelect('e.provider', 'provider')
      .orderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const item = await this.repo.findOne({
      where: { id },
      relations: ['provider'],
    });
    if (!item) throw new NotFoundException(`AI 模型 #${id} 不存在`);
    return item;
  }

  async create(data: CreateAiModelDto) {
    const item = this.repo.create(data);
    return this.repo.save(item);
  }

  async update(id: number, data: UpdateAiModelDto) {
    const item = await this.findById(id);
    Object.assign(item, data);
    return this.repo.save(item);
  }

  async remove(id: number) {
    const item = await this.findById(id);
    await this.repo.remove(item);
    return item;
  }

  async batchRemove(ids: number[]) {
    const items = await this.repo.findByIds(ids);
    await this.repo.remove(items);
    return items;
  }
}

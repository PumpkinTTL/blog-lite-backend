import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FriendLinkEntity } from './friend-link.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class FriendLinkService {
  constructor(
    @InjectRepository(FriendLinkEntity)
    private readonly repo: Repository<FriendLinkEntity>,
  ) {}

  async findAll(page = 1, pageSize = 20, filters?: { id?: number; keyword?: string; status?: number }) {
    const qb = this.repo.createQueryBuilder('e')
      .leftJoinAndSelect('e.post', 'post');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id, 'e.status': filters?.status },
      like: { keyword: filters?.keyword, fields: ['e.name'] },
    });
    qb.orderBy('e.sortOrder', 'ASC').addOrderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    return this.repo.findOne({ where: { id }, relations: ['post'] });
  }

  async create(data: Partial<FriendLinkEntity>) {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: number, data: Partial<FriendLinkEntity>) {
    // 排除关联字段，只更新纯字段
    const { post, ...updateData } = data as any;
    await this.repo.update(id, updateData);
    return this.findById(id);
  }

  async toggleStatus(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('友链不存在');
    entity.status = entity.status === 1 ? 0 : 1;
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
  }
}

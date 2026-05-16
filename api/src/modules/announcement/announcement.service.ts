import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnnouncementEntity } from './announcement.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectRepository(AnnouncementEntity)
    private readonly repo: Repository<AnnouncementEntity>,
  ) {}

  async findAll(page = 1, pageSize = 20, filters?: { id?: number; keyword?: string; status?: number }) {
    const qb = this.repo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id, 'e.status': filters?.status },
      like: { keyword: filters?.keyword, fields: ['e.title'] },
    });
    qb.orderBy('e.sortOrder', 'ASC').addOrderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    return this.repo.findOne({ where: { id } });
  }

  async create(data: Partial<AnnouncementEntity>) {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: number, data: Partial<AnnouncementEntity>) {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async toggleStatus(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('公告不存在');
    entity.status = entity.status === 1 ? 0 : 1;
    return this.repo.save(entity);
  }

  async togglePin(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('公告不存在');
    if (entity.sortOrder >= 1000) {
      entity.sortOrder = 0;
    } else {
      entity.sortOrder = 9999;
    }
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
  }
}

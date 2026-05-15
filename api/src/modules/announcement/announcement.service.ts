import { Injectable } from '@nestjs/common';
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

  async findAll(filters?: { id?: number; keyword?: string; status?: number }) {
    const qb = this.repo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id, 'e.status': filters?.status },
      like: { keyword: filters?.keyword, fields: ['e.title'] },
    });
    qb.orderBy('e.sortOrder', 'ASC').addOrderBy('e.createdAt', 'DESC');
    return qb.getMany();
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

  async remove(id: number) {
    await this.repo.delete(id);
  }
}

import { Injectable } from '@nestjs/common';
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

  async findAll(filters?: { id?: number; keyword?: string; status?: number }) {
    const qb = this.repo.createQueryBuilder('e')
      .leftJoinAndSelect('e.post', 'post');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id, 'e.status': filters?.status },
      like: { keyword: filters?.keyword, fields: ['e.name'] },
    });
    qb.orderBy('e.sortOrder', 'ASC').addOrderBy('e.createdAt', 'DESC');
    return qb.getMany();
  }

  async findById(id: number) {
    return this.repo.findOne({ where: { id }, relations: ['post'] });
  }

  async create(data: Partial<FriendLinkEntity>) {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: number, data: Partial<FriendLinkEntity>) {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async remove(id: number) {
    await this.repo.delete(id);
  }
}

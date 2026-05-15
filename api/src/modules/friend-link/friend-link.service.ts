import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FriendLinkEntity } from './friend-link.entity';

@Injectable()
export class FriendLinkService {
  constructor(
    @InjectRepository(FriendLinkEntity)
    private readonly repo: Repository<FriendLinkEntity>,
  ) {}

  async findAll(filters?: { id?: number; keyword?: string; status?: number }) {
    const qb = this.repo.createQueryBuilder('e')
      .leftJoinAndSelect('e.post', 'post');
    if (filters?.id !== undefined) {
      qb.andWhere('e.id = :id', { id: filters.id });
    }
    if (filters?.keyword) {
      qb.andWhere('e.name LIKE :kw', { kw: `%${filters.keyword}%` });
    }
    if (filters?.status !== undefined) {
      qb.andWhere('e.status = :status', { status: filters.status });
    }
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

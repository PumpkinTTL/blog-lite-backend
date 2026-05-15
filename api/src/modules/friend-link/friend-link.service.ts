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

  async findAll() {
    return this.repo.find({ relations: ['post'], order: { sortOrder: 'ASC', createdAt: 'DESC' } });
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

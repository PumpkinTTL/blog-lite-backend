import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from './role.entity';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
  ) {}

  async findAll(filters?: { id?: number; keyword?: string }) {
    const qb = this.roleRepo.createQueryBuilder('e');
    if (filters?.id !== undefined) {
      qb.andWhere('e.id = :id', { id: filters.id });
    }
    if (filters?.keyword) {
      qb.andWhere('(e.name LIKE :kw OR e.displayName LIKE :kw)', { kw: `%${filters.keyword}%` });
    }
    qb.orderBy('e.createdAt', 'DESC');
    return qb.getMany();
  }

  async findById(id: number) {
    return this.roleRepo.findOne({ where: { id } });
  }

  async create(data: Partial<RoleEntity>) {
    const role = this.roleRepo.create(data);
    return this.roleRepo.save(role);
  }

  async update(id: number, data: Partial<RoleEntity>) {
    await this.roleRepo.update(id, data);
    return this.findById(id);
  }

  async remove(id: number) {
    await this.roleRepo.delete(id);
  }
}

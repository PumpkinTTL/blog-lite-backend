import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from './role.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
  ) {}

  async findAll(filters?: { id?: number; keyword?: string }) {
    const qb = this.roleRepo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id },
      like: { keyword: filters?.keyword, fields: ['e.name', 'e.displayName'] },
    });
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
    // 排除关联字段，只更新纯字段
    const { users, ...updateData } = data as any;
    await this.roleRepo.update(id, updateData);
    return this.findById(id);
  }

  async remove(id: number) {
    await this.roleRepo.delete(id);
  }
}

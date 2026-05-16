import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    qb.loadRelationCountAndMap('e.userCount', 'e.users');
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
    const role = await this.roleRepo.findOne({
      where: { id },
      relations: ['users'],
    });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    if (role.name === 'admin' || role.name === 'user') {
      throw new BadRequestException('默认角色不可删除');
    }

    if (role.users && role.users.length > 0) {
      throw new BadRequestException(
        `该角色下有 ${role.users.length} 个用户，无法删除`,
      );
    }

    await this.roleRepo.delete(id);
  }
}

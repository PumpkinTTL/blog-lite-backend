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

  async findAll() {
    return this.roleRepo.find({ order: { createdAt: 'DESC' } });
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

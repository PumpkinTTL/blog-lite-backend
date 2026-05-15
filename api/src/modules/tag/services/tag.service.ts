import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TagEntity } from '../entities/tag.entity';

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
  ) {}

  async findAll() {
    return this.tagRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: number) {
    return this.tagRepo.findOne({ where: { id } });
  }

  async create(data: Partial<TagEntity>) {
    const tag = this.tagRepo.create(data);
    return this.tagRepo.save(tag);
  }

  async update(id: number, data: Partial<TagEntity>) {
    await this.tagRepo.update(id, data);
    return this.findById(id);
  }

  async remove(id: number) {
    await this.tagRepo.delete(id);
  }
}

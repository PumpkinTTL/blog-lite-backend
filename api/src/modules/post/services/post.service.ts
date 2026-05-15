import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostEntity } from '../entities/post.entity';

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
  ) {}

  async findAll(page = 1, pageSize = 20) {
    const [list, total] = await this.postRepo.findAndCount({
      relations: ['author', 'category', 'tags'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    return this.postRepo.findOne({ where: { id }, relations: ['author', 'category', 'tags'] });
  }

  async create(data: Partial<PostEntity>) {
    const post = this.postRepo.create(data);
    return this.postRepo.save(post);
  }

  async update(id: number, data: Partial<PostEntity>) {
    await this.postRepo.update(id, data);
    return this.findById(id);
  }

  async remove(id: number) {
    await this.postRepo.delete(id);
  }
}

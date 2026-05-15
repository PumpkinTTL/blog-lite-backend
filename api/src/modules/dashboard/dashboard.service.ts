import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostEntity } from '../post/post.entity';
import { CategoryEntity } from '../category/category.entity';
import { TagEntity } from '../tag/tag.entity';
import { MediaEntity } from '../media/media.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
    @InjectRepository(MediaEntity)
    private readonly mediaRepo: Repository<MediaEntity>,
  ) {}

  async getStats() {
    const [postCount, publishedCount, categoryCount, tagCount, mediaCount] = await Promise.all([
      this.postRepo.count(),
      this.postRepo.count({ where: { status: 1 } }),
      this.categoryRepo.count(),
      this.tagRepo.count(),
      this.mediaRepo.count(),
    ]);

    return {
      postCount,
      publishedCount,
      draftCount: postCount - publishedCount,
      categoryCount,
      tagCount,
      mediaCount,
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnnouncementEntity } from './announcement.entity';
import { applyFilters } from '../../common/utils/apply-filters';
import { ANNOUNCEMENT_STATUS } from '../../common/constants/status';

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectRepository(AnnouncementEntity)
    private readonly repo: Repository<AnnouncementEntity>,
  ) {}

  async findAll(
    page = 1,
    pageSize = 20,
    filters?: { id?: number; keyword?: string; status?: string },
  ) {
    const qb = this.repo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id, 'e.status': filters?.status },
      like: { keyword: filters?.keyword, fields: ['e.title'] },
    });
    qb.orderBy('e.sortOrder', 'ASC')
      .addOrderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('公告不存在');
    return entity;
  }

  async create(data: Partial<AnnouncementEntity>) {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: number, data: Partial<AnnouncementEntity>) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('公告不存在');
    await this.repo.update(id, data);
    return this.repo.findOne({ where: { id } });
  }

  async toggleStatus(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('公告不存在');
    entity.status =
      entity.status === ANNOUNCEMENT_STATUS.VISIBLE
        ? ANNOUNCEMENT_STATUS.HIDDEN
        : ANNOUNCEMENT_STATUS.VISIBLE;
    return this.repo.save(entity);
  }

  async togglePin(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('公告不存在');
    // 置顶语义：sortOrder ASC 排序，置顶的要在最前面。
    // 用负数表示置顶（-1 排在所有正常 sortOrder>=0 之前），0=正常。
    // 之前用 9999 置顶反而排到最后，逻辑反了。
    if (entity.sortOrder < 0) {
      entity.sortOrder = 0; // 取消置顶，恢复正常排序
    } else {
      entity.sortOrder = -1; // 置顶
    }
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
  }

  async batchRemove(ids: number[]): Promise<void> {
    await this.repo.delete(ids);
  }
}

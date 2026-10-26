import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdEntity } from './ad.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class AdService {
  private readonly logger = new Logger(AdService.name);

  constructor(
    @InjectRepository(AdEntity)
    private readonly repo: Repository<AdEntity>,
  ) {}

  /**
   * 管理端列表（带筛选 + 分页）
   * 返回全部字段（含 adminNote / impressions / clicks）
   */
  async findAll(
    page = 1,
    pageSize = 20,
    filters?: {
      id?: number;
      keyword?: string;
      position?: string;
      status?: string;
    },
  ) {
    const qb = this.repo.createQueryBuilder('a');
    applyFilters(qb, {
      exact: {
        'a.id': filters?.id,
        'a.position': filters?.position,
        'a.status': filters?.status,
      },
      like: {
        keyword: filters?.keyword,
        fields: ['a.title', 'a.subtitle', 'a.adminNote'],
      },
    });
    qb.addOrderBy('a.sortOrder', 'ASC')
      .addOrderBy('a.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /**
   * 公开查询（前台展示）
   * - 仅返回 status='active' 且在排期内的广告
   * - 脱敏：不返回 adminNote（后台内部备注）
   */
  async findPublic(position?: string) {
    const qb = this.repo
      .createQueryBuilder('a')
      .select([
        'a.id',
        'a.title',
        'a.subtitle',
        'a.imageUrl',
        'a.buttonText',
        'a.href',
        'a.position',
        'a.type',
        'a.sortOrder',
        // 故意不 select adminNote（后台备注不对外）
      ])
      .where('a.status = :status', { status: 'active' });

    if (position) {
      qb.andWhere('a.position = :position', { position });
    }

    // 排期过滤：startAt 已过 且 endAt 未到（NULL = 不限）
    qb.andWhere('(a.startAt IS NULL OR a.startAt <= :now)', { now: new Date() })
      .andWhere('(a.endAt IS NULL OR a.endAt >= :now)');

    qb.orderBy('a.sortOrder', 'ASC').addOrderBy('a.createdAt', 'DESC');

    return qb.getMany();
  }

  async findById(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('广告不存在');
    return entity;
  }

  async create(data: Partial<AdEntity>) {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: number, data: Partial<AdEntity>) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('广告不存在');
    Object.assign(entity, data);
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
  }

  async batchRemove(ids: number[]): Promise<void> {
    await this.repo.delete(ids);
  }

  /** active ↔ inactive 切换 */
  async toggleStatus(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('广告不存在');
    entity.status = entity.status === 'active' ? 'inactive' : 'active';
    return this.repo.save(entity);
  }

  /**
   * 埋点计数（原子自增，避免并发丢数）
   * @param type 'impression' 曝光 / 'click' 点击
   */
  async track(id: number, type: 'impression' | 'click') {
    const exists = await this.repo.exist({ where: { id, status: 'active' } });
    if (!exists) {
      // 埋点接口容错：广告被删/暂停不打 error，静默返回（前台 fire-and-forget）。
      // 此前不验 status——暂停中的广告仍可被刷计数（泄露审计 L2）
      this.logger.debug(`track: 广告 #${id} 不存在或未投放，忽略`);
      return;
    }
    const column = type === 'impression' ? 'impressions' : 'clicks';
    await this.repo
      .createQueryBuilder()
      .update(AdEntity)
      .set({ [column]: () => `${column} + 1` })
      .where('id = :id', { id })
      .execute();
  }
}

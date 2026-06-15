import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlacklistEntity } from './blacklist.entity';
import {
  CreateBlacklistDto,
  UpdateBlacklistDto,
} from './blacklist.dto';
import { applyFilters } from '../../common/utils/apply-filters';
import { BLACKLIST_STATUS } from '../../common/constants/status';

/** 缓存条目存活时间（ms） */
const CACHE_TTL = 30_000;

interface CacheEntry {
  blocked: boolean;
  expireAt: number;
}

@Injectable()
export class BlacklistService {
  private readonly logger = new Logger(BlacklistService.name);
  /** isBlocked 内存缓存：<type:value> → 是否封禁，30s TTL，避免每请求查库 */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(BlacklistEntity)
    private readonly repo: Repository<BlacklistEntity>,
  ) {}

  async findAll(
    page = 1,
    pageSize = 20,
    filters?: { id?: number; keyword?: string; type?: string; status?: string },
  ) {
    const qb = this.repo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: {
        'e.id': filters?.id,
        'e.type': filters?.type,
        'e.status': filters?.status,
      },
      like: { keyword: filters?.keyword, fields: ['e.value', 'e.reason'] },
    });
    qb.orderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('黑名单记录不存在');
    return entity;
  }

  async create(dto: CreateBlacklistDto, creatorId?: number) {
    const entity = this.repo.create({
      type: dto.type,
      value: dto.value,
      reason: dto.reason ?? null,
      status: BLACKLIST_STATUS.ACTIVE,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      creatorId: creatorId ?? null,
    });
    const saved = await this.repo.save(entity);
    // 新增封禁 → 失效该 key 缓存
    this.invalidateCache(dto.type, dto.value);
    this.logger.log(`新增黑名单: ${dto.type}:${dto.value}（原因：${dto.reason || '未填写'}）`);
    return saved;
  }

  async update(id: number, dto: UpdateBlacklistDto) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('黑名单记录不存在');
    await this.repo.update(id, {
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.expiresAt !== undefined
        ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
        : {}),
    });
    // 状态变更 → 失效缓存
    this.invalidateCache(existing.type, existing.value);
    return this.repo.findOne({ where: { id } });
  }

  async remove(id: number) {
    const existing = await this.repo.findOne({ where: { id } });
    if (existing) this.invalidateCache(existing.type, existing.value);
    await this.repo.delete(id);
  }

  async batchRemove(ids: number[]): Promise<void> {
    const records = await this.repo.find({ where: ids.map((id) => ({ id })) });
    records.forEach((r) => this.invalidateCache(r.type, r.value));
    await this.repo.delete(ids);
  }

  /**
   * 判定某 IP/用户是否被封禁（供 BlacklistGuard 调用）
   * 命中条件：status=active 且（expiresAt 为 null 或未过期）
   * 带 30s 内存缓存，避免每个请求查库
   */
  async isBlocked(type: string, value: string): Promise<boolean> {
    if (!value) return false;
    const cacheKey = `${type}:${value}`;
    const now = Date.now();

    // 命中缓存且未过期
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expireAt > now) {
      return cached.blocked;
    }

    // 查库
    const record = await this.repo.findOne({
      where: { type, value, status: BLACKLIST_STATUS.ACTIVE },
      select: ['id', 'expiresAt'],
    });

    let blocked = false;
    if (record) {
      blocked = !record.expiresAt || record.expiresAt.getTime() > now;
      // 若已过期但状态还是 active，惰性修正为 expired
      if (!blocked) {
        await this.repo.update(record.id, { status: BLACKLIST_STATUS.EXPIRED });
      }
    }

    this.cache.set(cacheKey, { blocked, expireAt: now + CACHE_TTL });
    return blocked;
  }

  /** 失效指定 key 缓存（增删改后调用） */
  private invalidateCache(type: string, value: string) {
    this.cache.delete(`${type}:${value}`);
  }
}

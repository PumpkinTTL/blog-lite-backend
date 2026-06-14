import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MembershipEntity, MembershipSource } from './membership.entity';
import { PlanEntity, PlanLevel } from '../plan/plan.entity';
import { PlanService } from '../plan/plan.service';
import { GrantMembershipDto, UpdateMembershipDto } from './membership.dto';

// 等级权重：用于比较两个等级谁更高（数字越大级别越高）
const LEVEL_WEIGHT: Record<PlanLevel, number> = {
  plus: 1,
  pro: 2,
  max: 3,
};

export interface MembershipSummary {
  level: PlanLevel;
  expiresAt: Date | null; // null = 终身
  planName: string;
}

@Injectable()
export class MembershipService implements OnModuleInit {
  private readonly logger = new Logger(MembershipService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(MembershipEntity)
    private readonly memberRepo: Repository<MembershipEntity>,
    private readonly planService: PlanService,
  ) {}

  /**
   * 启动时立即扫一次过期，然后每小时扫一次
   */
  async onModuleInit() {
    await this.sweepExpired();
    this.sweepTimer = setInterval(() => {
      this.sweepExpired().catch((e) => this.logger.error(`定时过期任务失败: ${e.message}`));
    }, 60 * 60 * 1000); // 1 小时
  }

  async onModuleDestroy() {
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
  }

  /**
   * 把已过期的 active 订阅标记为 expired
   * 注意：expiresAt IS NULL（终身）不处理
   */
  async sweepExpired(): Promise<number> {
    const result = await this.memberRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'expired' })
      .where('status = :active', { active: 'active' })
      .andWhere('expiresAt IS NOT NULL')
      .andWhere('expiresAt < :now', { now: new Date() })
      .execute();
    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.log(`自动过期 ${affected} 条会员订阅`);
    }
    return affected;
  }

  /**
   * 列表查询（admin 用）
   */
  async findAll(page = 1, pageSize = 20, filters?: { userId?: number; planId?: number; status?: string; source?: string }) {
    const qb = this.memberRepo.createQueryBuilder('m')
      .leftJoinAndSelect('m.user', 'user')
      .leftJoinAndSelect('m.plan', 'plan')
      .orderBy('m.createdAt', 'DESC');

    if (filters?.userId) qb.andWhere('m.userId = :userId', { userId: filters.userId });
    if (filters?.planId) qb.andWhere('m.planId = :planId', { planId: filters.planId });
    if (filters?.status) qb.andWhere('m.status = :status', { status: filters.status });
    if (filters?.source) qb.andWhere('m.source = :source', { source: filters.source });

    qb.skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number): Promise<MembershipEntity> {
    const m = await this.memberRepo.findOne({ where: { id }, relations: ['user', 'plan'] });
    if (!m) throw new NotFoundException('订阅记录不存在');
    return m;
  }

  /**
   * 开通/续期（admin 用，以及被兑换码调用）
   * - 同一 plan 的 active 记录已存在 → 在原 expiresAt 基础上向后延
   * - 不存在 → 新建记录
   * - dto.days 显式覆盖时长（0=终身，>0=按天），不传则用 plan.durationDays
   */
  async grant(dto: GrantMembershipDto): Promise<MembershipEntity> {
    const plan = await this.planService.findById(dto.planId);
    if (!plan.isActive) {
      throw new BadRequestException(`套餐「${plan.name}」已下架，无法开通`);
    }

    const now = new Date();
    // 时长：优先 dto.days（管理员灵活赠送），其次 plan.durationDays
    const durationDays = dto.days ?? plan.durationDays;
    const durationMs = durationDays * 24 * 60 * 60 * 1000;

    // 查找该用户该套餐的活跃订阅
    const existing = await this.memberRepo.findOne({
      where: { userId: dto.userId, planId: dto.planId, status: 'active' },
    });

    if (existing) {
      // 续期：基于现有 expiresAt（如果还没过期）或 now（已过期或终身已激活）向后延
      const baseTime = existing.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
      existing.expiresAt = durationDays === 0 ? null : new Date(baseTime.getTime() + durationMs);
      existing.status = 'active';
      if (dto.note) existing.note = dto.note;
      return this.memberRepo.save(existing);
    }

    // 新建
    const record = this.memberRepo.create({
      userId: dto.userId,
      planId: dto.planId,
      startedAt: now,
      expiresAt: durationDays === 0 ? null : new Date(now.getTime() + durationMs),
      status: 'active',
      source: (dto.source ?? 'admin') as MembershipSource,
      sourceId: dto.sourceId ?? null,
      note: dto.note ?? null,
    });
    const saved = await this.memberRepo.save(record);
    this.logger.log(`开通会员：userId=${dto.userId} plan=${plan.slug} days=${durationDays} source=${dto.source ?? 'admin'}`);
    return saved;
  }

  async update(id: number, dto: UpdateMembershipDto): Promise<MembershipEntity> {
    const m = await this.findById(id);
    if (dto.status) m.status = dto.status;
    if (dto.expiresAt !== undefined) m.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.note !== undefined) m.note = dto.note;
    return this.memberRepo.save(m);
  }

  async remove(id: number): Promise<void> {
    const m = await this.findById(id);
    await this.memberRepo.remove(m);
  }

  /**
   * 获取用户当前的最高会员等级（取所有 active 订阅中等级最高的）
   * 返回 null 表示无会员
   */
  async getActiveLevel(userId: number): Promise<PlanLevel | null> {
    const actives = await this.memberRepo.find({
      where: { userId, status: 'active' },
      relations: ['plan'],
    });
    if (actives.length === 0) return null;
    let highest: PlanLevel | null = null;
    let highestWeight = 0;
    for (const m of actives) {
      // 二次校验 expiresAt（防止 sweep 还没跑但已过期）
      if (m.expiresAt && m.expiresAt < new Date()) continue;
      const w = LEVEL_WEIGHT[m.plan.level];
      if (w > highestWeight) {
        highestWeight = w;
        highest = m.plan.level;
      }
    }
    return highest;
  }

  /**
   * 获取用户所有 active 订阅（详情页用）
   */
  async getUserActiveMemberships(userId: number): Promise<MembershipEntity[]> {
    return this.memberRepo.find({
      where: { userId, status: 'active' },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 批量查询多个用户的最高 active 会员等级（避免 N+1）
   *
   * 实现：一条 SQL（IN + JOIN plan + 过期过滤在 SQL 完成）+ 一次内存遍历挑最高等级。
   * 每个用户只会出现在结果 Map 里一次（等级最高的那条）。
   */
  async getHighestActiveBatch(userIds: number[]): Promise<Map<number, MembershipSummary>> {
    if (userIds.length === 0) return new Map();

    // 一条 SQL：JOIN plan、过滤 status=active + 过期
    const rows = await this.memberRepo
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.plan', 'p')
      .where('m.userId IN (:...ids)', { ids: userIds })
      .andWhere('m.status = :status', { status: 'active' })
      .andWhere('(m.expiresAt IS NULL OR m.expiresAt >= :now)', { now: new Date() })
      .getMany();

    // 一次遍历：每个 userId 保留等级最高（weight 大）的一条；同等级保留最远到期
    const best = new Map<number, { weight: number; summary: MembershipSummary }>();
    for (const m of rows) {
      const weight = LEVEL_WEIGHT[m.plan.level];
      const cur = best.get(m.userId);
      if (!cur || weight > cur.weight) {
        best.set(m.userId, {
          weight,
          summary: {
            level: m.plan.level,
            expiresAt: m.expiresAt,
            planName: m.plan.name,
          },
        });
      }
    }

    // 转 Map<userId, summary>
    const result = new Map<number, MembershipSummary>();
    for (const [userId, { summary }] of best) result.set(userId, summary);
    return result;
  }
}

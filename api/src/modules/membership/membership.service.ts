import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MembershipEntity } from './membership.entity';
import { PlanLevel } from '../plan/plan.entity';
import { PlanService } from '../plan/plan.service';
import { GrantMembershipDto, UpdateMembershipDto } from './membership.dto';
import { UserEntity } from '../user/user.entity';
import { RoleEntity } from '../user/role.entity';

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
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    private readonly planService: PlanService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 启动时立即扫一次过期，然后每小时扫一次
   */
  async onModuleInit() {
    await this.sweepExpired();
    this.sweepTimer = setInterval(
      () => {
        this.sweepExpired().catch((e) =>
          this.logger.error(`定时过期任务失败: ${e.message}`),
        );
      },
      60 * 60 * 1000,
    ); // 1 小时
  }

  async onModuleDestroy() {
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
  }

  /**
   * 把已过期的 active 订阅标记为 expired，并移除其绑定的角色（无其他订阅依赖时）。
   * 注意：expiresAt IS NULL（终身）不处理。
   */
  async sweepExpired(): Promise<number> {
    const now = new Date();
    // 1. 先查出待过期的记录（JOIN plan 取 roleId），原单条 UPDATE 无法带"移除角色"逻辑
    const expiring = await this.memberRepo.find({
      where: { status: 'active' },
      relations: ['plan'],
    });
    const toExpire = expiring.filter(
      (m) => m.expiresAt && m.expiresAt < now,
    );
    if (toExpire.length === 0) return 0;

    // 2. 标记 expired（批量）
    const ids = toExpire.map((m) => m.id);
    await this.memberRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'expired' })
      .where('id IN (:...ids)', { ids })
      .execute();

    // 3. 移除每条过期订阅绑定的角色（safeRevokeRole 自带双重订阅防误删）
    //    按 userId+roleId 去重，避免同一用户多条同时过期时重复处理
    const handled = new Set<string>();
    for (const m of toExpire) {
      const roleId = m.plan.roleId;
      if (!roleId) continue;
      const key = `${m.userId}:${roleId}`;
      if (handled.has(key)) continue;
      handled.add(key);
      try {
        const revoked = await this.safeRevokeRole(null, m.userId, roleId, m.id);
        if (revoked) {
          this.logger.log(
            `过期撤角色：userId=${m.userId} roleId=${roleId}（订阅 #${m.id} 过期）`,
          );
        }
      } catch (e) {
        // 单个撤角色失败不应阻塞批量过期；记录日志继续
        this.logger.warn(`过期撤角色失败 userId=${m.userId} roleId=${roleId}: ${(e as Error).message}`);
      }
    }

    this.logger.log(`自动过期 ${toExpire.length} 条会员订阅`);
    return toExpire.length;
  }

  /**
   * 列表查询（admin 用）
   */
  async findAll(
    page = 1,
    pageSize = 20,
    filters?: {
      userId?: number;
      planId?: number;
      status?: string;
      source?: string;
    },
  ) {
    const qb = this.memberRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.user', 'user')
      .leftJoinAndSelect('m.plan', 'plan')
      .orderBy('m.createdAt', 'DESC');

    if (filters?.userId)
      qb.andWhere('m.userId = :userId', { userId: filters.userId });
    if (filters?.planId)
      qb.andWhere('m.planId = :planId', { planId: filters.planId });
    if (filters?.status)
      qb.andWhere('m.status = :status', { status: filters.status });
    if (filters?.source)
      qb.andWhere('m.source = :source', { source: filters.source });

    qb.skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number): Promise<MembershipEntity> {
    const m = await this.memberRepo.findOne({
      where: { id },
      relations: ['user', 'plan'],
    });
    if (!m) throw new NotFoundException('订阅记录不存在');
    return m;
  }

  /**
   * 开通/续期（admin 用，以及被兑换码调用）
   * - 同一 plan 的 active 记录已存在 → 在原 expiresAt 基础上向后延
   * - 不存在 → 新建记录
   * - dto.days 显式覆盖时长（0=终身，>0=按天），不传则用 plan.durationDays
   */
  /**
   * 兑换前预检查：判断该用户能否兑换此套餐（不落库）。
   * 用于在消耗兑换码之前先校验，避免码被消耗后 grant 失败导致码白白浪费。
   * 检查项：套餐存在且上架 + 不是降级（降级会被 grant 拒绝）。
   * 注意：这只是预检查，grant 内部仍会在事务里再查一次防并发。
   */
  async preCheckGrant(userId: number, planId: number): Promise<void> {
    const plan = await this.planService.findById(planId);
    if (!plan.isActive) {
      throw new BadRequestException(`套餐「${plan.name}」已下架，无法开通`);
    }
    const newLevelWeight = LEVEL_WEIGHT[plan.level];
    const now = new Date();
    const actives = await this.memberRepo.find({
      where: { userId, status: 'active' },
      relations: ['plan'],
    });
    const validActives = actives.filter(
      (m) => !m.expiresAt || m.expiresAt > now,
    );
    const higherLevels = validActives.filter(
      (m) => LEVEL_WEIGHT[m.plan.level] > newLevelWeight,
    );
    if (higherLevels.length > 0) {
      const higher = higherLevels[0];
      throw new BadRequestException(
        `您当前是「${higher.plan.name}」，未到期无法兑换更低等级「${plan.name}」，请到期后再兑换`,
      );
    }
  }

  /**
   * 给用户授予角色（事务内，去重：已有则跳过）。
   * 用于 grant() 成功后绑定 plan.roleId。
   * @param manager 事务 EntityManager
   * @param userId 目标用户
   * @param roleId 要授予的角色 ID
   * @returns 是否实际新增了角色（false=已有或参数无效）
   */
  private async grantRole(
    manager: import('typeorm').EntityManager,
    userId: number,
    roleId: number | null,
  ): Promise<boolean> {
    if (!roleId) return false;
    const user = await manager.findOne(UserEntity, {
      where: { id: userId },
      relations: ['roles'],
    });
    if (!user) return false;
    if (user.roles.some((r) => r.id === roleId)) return false; // 已有
    const role = await manager.findOne(RoleEntity, { where: { id: roleId } });
    if (!role) return false;
    user.roles = [...user.roles, role];
    await manager.save(user);
    return true;
  }

  /**
   * 安全移除角色（事务内）：仅当用户没有其他 active 订阅仍依赖该角色时才移除。
   * 用于升级作废低级 / 过期时，防止"双重订阅"误删。
   * 例：用户有 pro_monthly 和 pro_yearly 两个订阅都绑 pro 角色，
   *     其中 pro_monthly 被作废时，pro_yearly 仍 active → 不应删 pro 角色。
   *
   * @param manager 事务 EntityManager（可为 null，表示用普通 repo 查）
   * @param userId 目标用户
   * @param roleId 要移除的角色 ID
   * @param excludeMembershipId 排除的订阅 ID（正在被作废/过期的那条，查"其他订阅"时跳过它）
   */
  private async safeRevokeRole(
    manager: import('typeorm').EntityManager | null,
    userId: number,
    roleId: number | null,
    excludeMembershipId?: number,
  ): Promise<boolean> {
    if (!roleId) return false;
    const now = new Date();

    // 查用户的其他 active 订阅（排除正在处理的那条），看是否仍依赖该 roleId
    const otherMemberships = await (manager ?? this.memberRepo.manager).find(
      MembershipEntity,
      {
        where: { userId, status: 'active' },
        relations: ['plan'],
      },
    );
    const stillNeeded = otherMemberships.some(
      (m) =>
        m.id !== excludeMembershipId &&
        m.plan.roleId === roleId &&
        (!m.expiresAt || m.expiresAt > now),
    );
    if (stillNeeded) return false; // 还有其他订阅要用这个角色，保留

    // 确实不再需要 → 从用户角色里移除
    const user = await (manager ?? this.userRepo.manager).findOne(UserEntity, {
      where: { id: userId },
      relations: ['roles'],
    });
    if (!user) return false;
    if (!user.roles.some((r) => r.id === roleId)) return false; // 本来就没有
    user.roles = user.roles.filter((r) => r.id !== roleId);
    await (manager ?? this.userRepo.manager).save(user);
    return true;
  }

  async grant(dto: GrantMembershipDto): Promise<MembershipEntity> {
    const plan = await this.planService.findById(dto.planId);
    if (!plan.isActive) {
      throw new BadRequestException(`套餐「${plan.name}」已下架，无法开通`);
    }

    const now = new Date();
    const durationDays = dto.days ?? plan.durationDays;
    const newLevelWeight = LEVEL_WEIGHT[plan.level];
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // 整个 grant 包在事务里：升降级判断 + 作废低级 + 续期/开通 必须原子，
    // 否则并发两个兑换请求会同时查到"无同级 active"，各建一条 → 数据污染。
    // 用 SELECT ... FOR UPDATE 锁住该用户的所有 active 会员记录，保证串行化。
    return this.dataSource.transaction(async (manager) => {
      // 悲观锁：锁住该用户的活跃会员行，并发请求会等这里提交后才继续
      const actives = await manager
        .createQueryBuilder(MembershipEntity, 'm')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('m.plan', 'plan')
        .where('m.userId = :userId', { userId: dto.userId })
        .andWhere('m.status = :status', { status: 'active' })
        .getMany();
      // 过滤掉已过期但 sweep 还没跑到的（按 expiresAt 二次校验）
      const validActives = actives.filter(
        (m) => !m.expiresAt || m.expiresAt > now,
      );

      // 升降级策略
      const sameLevel = validActives.find(
        (m) => m.plan.level === plan.level,
      );
      const lowerLevels = validActives.filter(
        (m) => LEVEL_WEIGHT[m.plan.level] < newLevelWeight,
      );
      const higherLevels = validActives.filter(
        (m) => LEVEL_WEIGHT[m.plan.level] > newLevelWeight,
      );

      // 降级：拒绝（当前是更高级会员，未到期不能换更低级）
      if (higherLevels.length > 0) {
        const higher = higherLevels[0];
        throw new BadRequestException(
          `您当前是「${higher.plan.name}」，未到期无法兑换更低等级「${plan.name}」，请到期后再兑换`,
        );
      }

      // 升级：作废所有低级 active 会员（标 cancelled，保留记录供审计）
      if (lowerLevels.length > 0) {
        for (const lower of lowerLevels) {
          lower.status = 'cancelled';
          const note = (lower.note || '').replace(/\s*\|.*$/, '');
          lower.note = `${note} | 因升级到「${plan.name}」于 ${now.toISOString()} 作废`.trimStart();
          await manager.save(lower);
          // 同步撤掉低级 plan 绑定的角色（若用户无其他订阅依赖它）
          const revoked = await this.safeRevokeRole(
            manager,
            dto.userId,
            lower.plan.roleId,
            lower.id,
          );
          if (revoked) {
            this.logger.log(
              `升级撤角色：userId=${dto.userId} 移除低级 plan「${lower.plan.slug}」的角色 roleId=${lower.plan.roleId}`,
            );
          }
        }
        this.logger.log(
          `升级：userId=${dto.userId} 作废 ${lowerLevels.length} 条低级会员，开通「${plan.name}」`,
        );
      }

      // 同等级续期：基于 expiresAt 续，终身不被限时码覆盖
      if (sameLevel) {
        // 已是终身（expiresAt=null）+ 新码非终身：保持终身不缩短
        if (sameLevel.expiresAt === null) {
          if (durationDays !== 0) {
            this.logger.log(
              `userId=${dto.userId} 已是终身会员，忽略 ${durationDays} 天续期码`,
            );
          }
          return sameLevel;
        }
        // 限时会员续期：未过期则基于原 expiresAt 续，已过期则从 now 起算
        const baseTime = sameLevel.expiresAt > now ? sameLevel.expiresAt : now;
        sameLevel.expiresAt =
          durationDays === 0
            ? null
            : new Date(baseTime.getTime() + durationDays * MS_PER_DAY);
        sameLevel.status = 'active';
        if (dto.note) sameLevel.note = dto.note;
        const saved = await manager.save(sameLevel);
        this.logger.log(
          `续期：userId=${dto.userId} plan=${plan.slug} days=${durationDays} → 到期 ${saved.expiresAt?.toISOString() || '终身'}`,
        );
        return saved;
      }

      // 全新开通（升级作废低级后 或 首次开通）
      const record = manager.create(MembershipEntity, {
        userId: dto.userId,
        planId: dto.planId,
        startedAt: now,
        expiresAt:
          durationDays === 0 ? null : new Date(now.getTime() + durationDays * MS_PER_DAY),
        status: 'active',
        source: dto.source ?? 'admin',
        sourceId: dto.sourceId ?? null,
        note: dto.note ?? null,
      });
      const saved = await manager.save(record);
      // 授予 plan 绑定的角色（去重）
      const granted = await this.grantRole(manager, dto.userId, plan.roleId);
      if (granted) {
        this.logger.log(
          `授予角色：userId=${dto.userId} roleId=${plan.roleId}（开通「${plan.name}」）`,
        );
      }
      this.logger.log(
        `开通会员：userId=${dto.userId} plan=${plan.slug} days=${durationDays} source=${dto.source ?? 'admin'}`,
      );
      return saved;
    });
  }

  async update(
    id: number,
    dto: UpdateMembershipDto,
  ): Promise<MembershipEntity> {
    const m = await this.findById(id);
    const wasActive = m.status === 'active';
    if (dto.status) m.status = dto.status;
    if (dto.expiresAt !== undefined)
      m.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.note !== undefined) m.note = dto.note;
    const saved = await this.memberRepo.save(m);
    // 从 active 改为其他状态（如取消）→ 撤掉该套餐绑定的角色（防双重订阅误删）
    if (wasActive && dto.status && dto.status !== 'active' && m.plan.roleId) {
      await this.safeRevokeRole(null, m.userId, m.plan.roleId, m.id);
    }
    return saved;
  }

  async remove(id: number): Promise<void> {
    const m = await this.findById(id);
    const wasActive = m.status === 'active';
    await this.memberRepo.remove(m);
    // 删除一条 active 会员 → 撤角色（若该用户无其他订阅依赖此角色）
    if (wasActive && m.plan.roleId) {
      // remove 后记录已不存在，safeRevokeRole 内部查"其他订阅"时不会包含它
      await this.safeRevokeRole(null, m.userId, m.plan.roleId, undefined);
    }
  }

  async batchRemove(ids: number[]): Promise<void> {
    // 先查出待删除记录（含 plan.roleId），删除后逐条撤角色
    const toRemove = await this.memberRepo.find({
      where: ids.map((id) => ({ id })),
      relations: ['plan'],
    });
    await this.memberRepo.delete(ids);
    for (const m of toRemove) {
      if (m.status === 'active' && m.plan.roleId) {
        await this.safeRevokeRole(null, m.userId, m.plan.roleId, undefined);
      }
    }
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
  async getHighestActiveBatch(
    userIds: number[],
  ): Promise<Map<number, MembershipSummary>> {
    if (userIds.length === 0) return new Map();

    // 一条 SQL：JOIN plan、过滤 status=active + 过期
    const rows = await this.memberRepo
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.plan', 'p')
      .where('m.userId IN (:...ids)', { ids: userIds })
      .andWhere('m.status = :status', { status: 'active' })
      .andWhere('(m.expiresAt IS NULL OR m.expiresAt >= :now)', {
        now: new Date(),
      })
      .getMany();

    // 一次遍历：每个 userId 保留等级最高（weight 大）的一条；同等级保留最远到期
    const best = new Map<
      number,
      { weight: number; summary: MembershipSummary }
    >();
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

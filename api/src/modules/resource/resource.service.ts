import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceEntity } from './resource.entity';
import { applyFilters } from '../../common/utils/apply-filters';
import { RESOURCE_STATUS } from '../../common/constants/status';
import { EntityVisibilityService } from '../entity-visibility/entity-visibility.service';
import { CodeService } from '../code/code.service';

/** resource 在 entity_visibility 多态表中的 entityType 标识 */
export const RESOURCE_ENTITY_TYPE = 'resource';

/** 详情访问状态：决定是否返回敏感字段（panLinks） */
export type AccessStatus = 'full' | 'locked';

export interface ResourceAccessResult {
  resource: ResourceEntity;
  accessStatus: AccessStatus;
  /** locked 时的原因，供前端展示锁定提示 */
  lockReason?: 'login_required' | 'no_access' | 'need_redeem' | 'insufficient_role';
}

@Injectable()
export class ResourceService {
  private readonly logger = new Logger(ResourceService.name);

  constructor(
    @InjectRepository(ResourceEntity)
    private readonly repo: Repository<ResourceEntity>,
    private readonly visibilityService: EntityVisibilityService,
    private readonly codeService: CodeService,
  ) {}

  /**
   * 列表查询（公开端点用）
   * @param publicOnly 非 admin 时为 true，仅返回 published/login
   * @param isLoggedIn 已登录（非 admin），额外可见 login
   * @param withAdminVisibility admin 列表注入可见性配置
   */
  async findAll(
    page = 1,
    pageSize = 20,
    filters?: { id?: number; keyword?: string; status?: string; categoryId?: number },
    publicOnly = false,
    isLoggedIn = false,
    withAdminVisibility = false,
  ) {
    // 列表不取 content（正文 TEXT 大字段，详情接口单独取）。
    // panLinks（JSON）公开列表一并裁掉（列表本就不返回）；admin 列表保留
    // （表格有"网盘链接数"徽章依赖 panLinks.length，且低频使用）。
    const excluded = publicOnly
      ? ['content', 'panLinks', 'requiredRoleIds', 'minMemberLevel', 'uploaderId']
      : ['content'];
    const qb = this.repo
      .createQueryBuilder('e')
      .select(
        this.repo.metadata.columns
          .filter((c) => !excluded.includes(c.propertyName))
          .map((c) => `e.${c.propertyName}`),
      )
      .leftJoinAndSelect('e.category', 'category')
      // 只 select uploader 的公开安全字段，避免泄露 email/phone/registerIp 等 PII。
      // admin 需要看完整用户信息时走 user 管理模块，不在此处暴露。
      .leftJoin('e.uploader', 'uploader')
      .addSelect(['uploader.id', 'uploader.nickname', 'uploader.avatar']);
    applyFilters(qb, {
      exact: {
        'e.id': filters?.id,
        'e.status': filters?.status,
        'e.categoryId': filters?.categoryId,
      },
      like: { keyword: filters?.keyword, fields: ['e.title'] },
    });

    if (publicOnly) {
      if (isLoggedIn) {
        qb.andWhere('e.status IN (:...visible)', {
          visible: [RESOURCE_STATUS.PUBLISHED, RESOURCE_STATUS.LOGIN],
        });
      } else {
        qb.andWhere('e.status = :published', {
          published: RESOURCE_STATUS.PUBLISHED,
        });
      }
    }

    qb.orderBy('e.sortOrder', 'ASC')
      .addOrderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();

    // 公开端点：列表永不返回敏感字段 panLinks
    if (publicOnly) {
      list.forEach((r) => (r.panLinks = null));
    }

    // admin 列表注入可见性配置（仅对 private 资源，用批量查询避免 N+1）
    if (withAdminVisibility && list.length > 0) {
      const privateIds = list
        .filter((r) => r.status === RESOURCE_STATUS.PRIVATE)
        .map((r) => r.id);
      if (privateIds.length > 0) {
        // 用 getVisibilityBatch（一次 WHERE IN 查询）替代 N 次单查
        const visMap = await this.visibilityService.getVisibilityBatch(
          RESOURCE_ENTITY_TYPE,
          privateIds,
        );
        list.forEach((r) => {
          if (r.status === RESOURCE_STATUS.PRIVATE) {
            const v = visMap.get(r.id);
            (r as any).allowedUserIds = v?.allowedUserIds ?? [];
            (r as any).allowedRoleIds = v?.allowedRoleIds ?? [];
          }
        });
      }
    }

    return { list, total, page, pageSize };
  }

  async findById(id: number, publicOnly = false) {
    // 用 queryBuilder 精确控制 uploader 字段，避免公开接口泄露 PII
    const qb = this.repo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.category', 'category')
      .leftJoin('e.uploader', 'uploader')
      .addSelect(['uploader.id', 'uploader.nickname', 'uploader.avatar'])
      .where('e.id = :id', { id });
    if (publicOnly) {
      // 非 admin 详情查询：允许 published/login/private，由上层 findByIdForUser 做细粒度判定
      // draft 对非 admin 完全不可见（当作不存在）
      qb.andWhere('e.status IN (:...statuses)', {
        statuses: [RESOURCE_STATUS.PUBLISHED, RESOURCE_STATUS.LOGIN, RESOURCE_STATUS.PRIVATE],
      });
    }
    return qb.getOne();
  }

  /**
   * 详情访问判定（核心锁定逻辑）
   * 返回 accessStatus='full' 时 resource 含完整 panLinks；'locked' 时 panLinks 已置 null
   *
   * 权益校验已改为角色驱动：resource.allowedRoleIds 指定允许访问的角色组，
   * 用户角色与之有任一交集即可解锁（取代旧的 minMemberLevel 等级判定）。
   */
  async findByIdForUser(
    id: number,
    userId: number | null,
    userRoleIds: number[] = [],
    isAdmin: boolean,
  ): Promise<ResourceAccessResult | null> {
    // admin 查全部；匿名只查 published；登录用户查 published/login/private（上层再判定）
    const publicOnly = !isAdmin && userId === null;
    const resource = await this.findById(id, publicOnly);
    if (!resource) return null;

    // admin 直接放行
    if (isAdmin) {
      return { resource, accessStatus: 'full' };
    }

    // draft：非 admin 不可见（直接当作不存在）
    if (resource.status === RESOURCE_STATUS.DRAFT) {
      return null;
    }

    // login：匿名不可见
    if (resource.status === RESOURCE_STATUS.LOGIN && userId === null) {
      return {
        resource: this.stripSensitive(resource),
        accessStatus: 'locked',
        lockReason: 'login_required',
      };
    }

    // private：必须被授权，未授权直接当作不存在（不泄露标题/封面等元信息，防 ID 遍历探测）
    if (resource.status === RESOURCE_STATUS.PRIVATE) {
      if (userId === null) {
        return null;
      }
      const allowed = await this.visibilityService.canAccess(
        RESOURCE_ENTITY_TYPE,
        id,
        userId,
        userRoleIds,
      );
      if (!allowed) {
        return null;
      }
    }

    // 角色权益校验：resource.requiredRoleIds 指定解锁所需的角色组，
    // 用户角色与之有任一交集即可解锁；匿名用户无角色，必锁。
    if (resource.requiredRoleIds && resource.requiredRoleIds.length > 0) {
      const hasAccess =
        userId !== null &&
        userRoleIds.some((rid) => resource.requiredRoleIds!.includes(rid));
      if (!hasAccess) {
        return {
          resource: this.stripSensitive(resource),
          accessStatus: 'locked',
          lockReason: 'insufficient_role',
        };
      }
    }

    // 全部通过 → 返回完整内容（panLinks 保留；内部配置三列仍剔——泄露审计 L4）
    resource.requiredRoleIds = null;
    resource.minMemberLevel = null;
    resource.uploaderId = null;
    return { resource, accessStatus: 'full' };
  }

  /** 抹除敏感字段（锁定时返回预览信息） */
  private stripSensitive(r: ResourceEntity): ResourceEntity {
    r.panLinks = null;
    // 内部配置列（泄露审计 L4）：角色门禁映射/废弃字段/上传者外键不对匿名暴露
    r.requiredRoleIds = null;
    r.minMemberLevel = null;
    r.uploaderId = null;
    return r;
  }

  async canAccess(id: number, userId: number, userRoleIds: number[] = []) {
    return this.visibilityService.canAccess(
      RESOURCE_ENTITY_TYPE,
      id,
      userId,
      userRoleIds,
    );
  }

  /** 读取可见性配置（admin 用） */
  async getVisibility(id: number) {
    return this.visibilityService.getVisibility(RESOURCE_ENTITY_TYPE, id);
  }

  /** 写入可见性配置（admin 用，全量覆盖） */
  async setVisibility(
    id: number,
    allowedUserIds: number[] = [],
    allowedRoleIds: number[] = [],
  ) {
    await this.visibilityService.setVisibility(
      RESOURCE_ENTITY_TYPE,
      id,
      allowedUserIds,
      allowedRoleIds,
    );
  }

  /**
   * 单条追加用户解锁（兑换码 / 购买成功后调用）
   * 用 INSERT IGNORE 幂等追加（依赖组合唯一约束），避免旧的 read-modify-write
   * 并发覆盖问题（两个兑换同时 grantAccess 可能丢一个用户的授权）。
   */
  async grantAccess(id: number, userId: number): Promise<void> {
    await this.visibilityService.grantAccess(
      RESOURCE_ENTITY_TYPE,
      id,
      'user',
      userId,
    );
  }

  async create(data: Partial<ResourceEntity>) {
    const { allowedUserIds, allowedRoleIds, ...rest } = data as any;
    const entity = this.repo.create(rest as ResourceEntity);
    const saved = await this.repo.save(entity);

    // private 资源同步写可见性
    if (saved.status === RESOURCE_STATUS.PRIVATE) {
      await this.setVisibility(
        saved.id,
        allowedUserIds ?? [],
        allowedRoleIds ?? [],
      );
    }
    return saved;
  }

  async update(id: number, data: Partial<ResourceEntity>) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('资源不存在');

    const { allowedUserIds, allowedRoleIds, ...rest } = data as any;
    await this.repo.update(id, rest);

    // 仅在显式传入可见性配置时才覆盖（避免误清空）
    if (allowedUserIds !== undefined || allowedRoleIds !== undefined) {
      await this.setVisibility(
        id,
        allowedUserIds ?? [],
        allowedRoleIds ?? [],
      );
    }
    return this.repo.findOne({ where: { id }, relations: ['category', 'uploader'] });
  }

  async toggleStatus(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('资源不存在');
    // 只在 published ↔ draft 之间切换；login/private 是独立可见性状态，
    // toggle 会丢失其语义，应通过专门的接口（如 update）修改
    if (
      entity.status !== RESOURCE_STATUS.PUBLISHED &&
      entity.status !== RESOURCE_STATUS.DRAFT
    ) {
      throw new BadRequestException(
        `当前状态为「${entity.status}」，只能在已发布/草稿之间切换`,
      );
    }
    entity.status =
      entity.status === RESOURCE_STATUS.PUBLISHED
        ? RESOURCE_STATUS.DRAFT
        : RESOURCE_STATUS.PUBLISHED;
    return this.repo.save(entity);
  }

  async incrementView(id: number) {
    await this.repo.increment({ id }, 'viewCount', 1);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    // 清理该资源的可见性配置
    await this.visibilityService.purgeEntity(RESOURCE_ENTITY_TYPE, id);
  }

  async batchRemove(ids: number[]): Promise<void> {
    await this.repo.delete(ids);
    await Promise.all(
      ids.map((id) =>
        this.visibilityService.purgeEntity(RESOURCE_ENTITY_TYPE, id),
      ),
    );
  }

  /**
   * 兑换码解锁资源
   * 流程：verifyCode → 校验 metadata.resourceId → useCode → grantAccess
   */
  async redeem(codeValue: string, userId: number, clientIp: string) {
    // 1. 校验码
    const verify = await this.codeService.verifyCode({
      code: codeValue,
      type: 'resource',
    });
    if (!verify.valid || !verify.code) {
      throw new BadRequestException(verify.message || '兑换码无效');
    }

    // 2. 从 metadata 取 resourceId
    const resourceId = (verify.code.metadata as any)?.resourceId;
    if (!resourceId) {
      throw new BadRequestException('兑换码未绑定资源');
    }

    const resource = await this.repo.findOne({
      where: { id: Number(resourceId) },
    });
    if (!resource) {
      throw new NotFoundException('兑换码绑定的资源不存在');
    }

    // 3. 消费码（事务内扣减 usedCount + 写日志）
    await this.codeService.useCode(codeValue, userId, clientIp, {
      action: 'unlock_resource',
      resourceId: resource.id,
    });

    // 4. 授予访问权
    await this.grantAccess(resource.id, userId);

    this.logger.log(
      `用户 ${userId} 通过兑换码解锁资源 ${resource.id}（${resource.title}）`,
    );

    return { resource, message: '兑换成功' };
  }
}

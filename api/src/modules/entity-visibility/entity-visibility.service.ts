import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  EntityVisibilityEntity,
  VisibilitySubjectType,
} from './entity-visibility.entity';

export type EntityType = string;

@Injectable()
export class EntityVisibilityService {
  constructor(
    @InjectRepository(EntityVisibilityEntity)
    private readonly repo: Repository<EntityVisibilityEntity>,
  ) {}

  /**
   * 设置某资源的可见性（全量覆盖）
   * 传入 allowedUserIds + allowedRoleIds，会清掉该资源原有所有授权并重新写入
   */
  async setVisibility(
    entityType: EntityType,
    entityId: number,
    allowedUserIds: number[] = [],
    allowedRoleIds: number[] = [],
  ): Promise<void> {
    // 1. 删除该资源原有的所有授权
    await this.repo.delete({ entityType, entityId });

    // 2. 批量写入新授权
    const rows: Partial<EntityVisibilityEntity>[] = [];
    for (const userId of dedupe(allowedUserIds)) {
      rows.push({
        entityType,
        entityId,
        subjectType: 'user',
        subjectId: userId,
      });
    }
    for (const roleId of dedupe(allowedRoleIds)) {
      rows.push({
        entityType,
        entityId,
        subjectType: 'role',
        subjectId: roleId,
      });
    }
    if (rows.length) {
      await this.repo.save(rows);
    }
  }

  /**
   * 获取某资源的可见性配置
   */
  async getVisibility(entityType: EntityType, entityId: number) {
    const rows = await this.repo.find({ where: { entityType, entityId } });
    return {
      allowedUserIds: rows
        .filter((r) => r.subjectType === 'user')
        .map((r) => r.subjectId),
      allowedRoleIds: rows
        .filter((r) => r.subjectType === 'role')
        .map((r) => r.subjectId),
    };
  }

  /**
   * 批量获取多资源的可见性配置（一次查询，避免 N+1）。
   * 返回 Map<entityId, { allowedUserIds, allowedRoleIds }>。
   * 未配置可见性的资源不会出现在 Map 中（调用方按需兜底空数组）。
   */
  async getVisibilityBatch(
    entityType: EntityType,
    entityIds: number[],
  ): Promise<
    Map<number, { allowedUserIds: number[]; allowedRoleIds: number[] }>
  > {
    const result = new Map<
      number,
      { allowedUserIds: number[]; allowedRoleIds: number[] }
    >();
    if (entityIds.length === 0) return result;
    // 一次查询拉回所有资源的授权行
    const rows = await this.repo.find({
      where: { entityType, entityId: In(entityIds) },
    });
    // 按 entityId 分组聚合
    for (const r of rows) {
      let entry = result.get(r.entityId);
      if (!entry) {
        entry = { allowedUserIds: [], allowedRoleIds: [] };
        result.set(r.entityId, entry);
      }
      if (r.subjectType === 'user') entry.allowedUserIds.push(r.subjectId);
      else if (r.subjectType === 'role') entry.allowedRoleIds.push(r.subjectId);
    }
    return result;
  }

  /**
   * 统计某类资源在可见性表中的记录数（迁移幂等检查用）
   */
  async getVisibilityCount(entityType: EntityType): Promise<number> {
    return this.repo.count({ where: { entityType } });
  }

  /**
   * 判定用户能否访问某资源
   * 1. 直接授权：subjectType='user', subjectId=userId
   * 2. 角色授权：subjectType='role', subjectId ∈ 用户拥有的角色ID集合
   *
   * @param userRoleIds 用户拥有的角色 ID 集合（无角色传空数组）
   */
  async canAccess(
    entityType: EntityType,
    entityId: number,
    userId: number,
    userRoleIds: number[] = [],
  ): Promise<boolean> {
    if (userRoleIds.length === 0) {
      // 只需查直接授权
      const direct = await this.repo.findOne({
        where: { entityType, entityId, subjectType: 'user', subjectId: userId },
      });
      return !!direct;
    }

    // 同时查 user 授权 + role 授权（一次查询）
    const cnt = await this.repo.count({
      where: [
        { entityType, entityId, subjectType: 'user', subjectId: userId },
        {
          entityType,
          entityId,
          subjectType: 'role',
          subjectId: In(userRoleIds),
        },
      ],
    });
    return cnt > 0;
  }

  /**
   * 批量判定用户能否访问多个资源（避免 N+1）
   * 返回用户可见的 entityId 集合
   */
  async filterAccessible(
    entityType: EntityType,
    entityIds: number[],
    userId: number,
    userRoleIds: number[] = [],
  ): Promise<Set<number>> {
    if (entityIds.length === 0) return new Set();
    const conditions: any[] = [
      {
        entityType,
        entityId: In(entityIds),
        subjectType: 'user' as VisibilitySubjectType,
        subjectId: userId,
      },
    ];
    if (userRoleIds.length > 0) {
      conditions.push({
        entityType,
        entityId: In(entityIds),
        subjectType: 'role' as VisibilitySubjectType,
        subjectId: In(userRoleIds),
      });
    }
    const rows = await this.repo.find({ where: conditions });
    return new Set(rows.map((r) => r.entityId));
  }

  /**
   * 删除某资源的所有可见性配置（资源被删除时调用）
   */
  async purgeEntity(entityType: EntityType, entityId: number): Promise<void> {
    await this.repo.delete({ entityType, entityId });
  }
}

function dedupe(arr: number[]): number[] {
  return Array.from(new Set(arr));
}

import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SettingEntity } from './setting.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

/** 操作者信息（审计用，controller 从 req.user 传入） */
export interface SettingOperator {
  id?: number;
  name?: string;
}

@Injectable()
export class SettingService {
  // 进程内缓存：setting 是低频写、高频读，加内存缓存减少 DB 压力。
  // 写操作（create/update/remove）时调用 invalidate() 清空，下次读重新加载。
  private cache: Map<string, SettingEntity> | null = null;
  // 冷启动雷群防护：并发的 loadCache 共用同一个 Promise
  private loadPromise: Promise<Map<string, SettingEntity>> | null = null;

  constructor(
    @InjectRepository(SettingEntity)
    private readonly repo: Repository<SettingEntity>,
    private readonly dataSource: DataSource,
    // AuditLogModule 是 @Global，可直接注入；@Optional 兼容测试环境
    @Optional() private readonly auditLog?: AuditLogService,
  ) {}

  /** 清空缓存（写操作后调用） */
  private invalidate() {
    this.cache = null;
  }

  /** 加载全部配置到缓存（懒加载，带并发去重） */
  private async loadCache(): Promise<Map<string, SettingEntity>> {
    if (this.cache) return this.cache;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.repo.find().then((list) => {
      const m = new Map(list.map((s) => [s.key, s]));
      this.cache = m;
      return m;
    }).finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  /** 记录配置变更审计（value 变化时）。
   *  审查P1：敏感 key 的明文曾直接进 audit_logs（并在 admin 前端回显），
   *  绕过整套出口掩码。此处对敏感值统一记 [REDACTED]。 */
  private logChange(
    existing: SettingEntity,
    newValue: string,
    operator?: SettingOperator,
  ) {
    if (!this.auditLog) return;
    if (existing.value === newValue) return;
    const SENSITIVE = new Set([
      'smtp.pass',
      'ai.tavily_key',
      'turnstile.secret_key',
      'storage.r2.accounts',
    ]);
    const sensitive = SENSITIVE.has(existing.key);
    const auditOld = sensitive ? '[REDACTED]' : existing.value;
    const auditNew = sensitive ? '[REDACTED]' : newValue;
    this.auditLog
      .log({
        targetType: 'setting',
        targetId: existing.id,
        field: existing.key,
        oldValue: auditOld,
        newValue: auditNew,
        operatorId: operator?.id,
        operatorName: operator?.name,
        targetName: existing.key,
      })
      .catch(() => {
        /* 审计写入失败不阻断主流程 */
      });
  }

  async findAll() {
    const list = await this.repo.find({ order: { group: 'ASC', key: 'ASC' } });
    // 返回按 group 分组的结构
    const grouped: Record<string, SettingEntity[]> = {};
    for (const item of list) {
      if (!grouped[item.group]) grouped[item.group] = [];
      grouped[item.group].push(item);
    }
    return grouped;
  }

  async findByKey(key: string) {
    const cache = await this.loadCache();
    return cache.get(key) ?? null;
  }

  async create(data: Partial<SettingEntity>, operator?: SettingOperator) {
    const entity = this.repo.create(data);
    const saved = await this.repo.save(entity);
    this.invalidate();
    // 新建配置记录审计
    if (this.auditLog && operator) {
      this.auditLog
        .log({
          targetType: 'setting',
          targetId: saved.id,
          field: saved.key,
          newValue: saved.value,
          operatorId: operator.id,
          operatorName: operator.name,
          targetName: saved.key,
          note: '新建配置项',
        })
        .catch(() => {});
    }
    return saved;
  }

  async updateById(
    id: number,
    data: Partial<SettingEntity>,
    operator?: SettingOperator,
  ) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('配置项不存在');
    const oldValue = existing.value;
    await this.repo.update(id, data);
    this.invalidate();
    const updated = await this.repo.findOne({ where: { id } });
    // value 变化时记录审计
    if (updated && data.value !== undefined) {
      this.logChange({ ...existing, value: oldValue }, data.value, operator);
    }
    return updated;
  }

  async remove(id: number, operator?: SettingOperator) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) return;
    await this.repo.delete(id);
    this.invalidate();
    // 删除配置记录审计
    if (this.auditLog && operator) {
      this.auditLog
        .log({
          targetType: 'setting',
          targetId: id,
          field: existing.key,
          oldValue: existing.value,
          operatorId: operator.id,
          operatorName: operator.name,
          targetName: existing.key,
          note: '删除配置项',
        })
        .catch(() => {});
    }
  }

  async findByGroup(group: string) {
    const cache = await this.loadCache();
    return Array.from(cache.values())
      .filter((s) => s.group === group)
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async batchUpdateByGroup(
    group: string,
    items: Record<string, string>,
    operator?: SettingOperator,
  ) {
    // 批量写入必须原子：一次请求里的多个 key 要么全成功要么全回滚，
    // 否则前端看到 500 时 DB 已是半新半旧（比如 turnstile.enabled=true 但 secret 还是旧的）。
    // 事务内不再读缓存（缓存可能滞后），直接用 manager 查库。
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const results: SettingEntity[] = [];
      for (const [key, value] of Object.entries(items)) {
        const existing = await queryRunner.manager.findOne(SettingEntity, { where: { key, group } });
        if (existing) {
          this.logChange(existing, value, operator);
          // 不直接改 existing（它是缓存对象的引用），克隆后再保存避免脏读
          const toSave = { ...existing, value };
          results.push(await queryRunner.manager.save(SettingEntity, toSave));
        } else {
          const created = queryRunner.manager.create(SettingEntity, { key, value, group });
          results.push(await queryRunner.manager.save(created));
        }
      }
      await queryRunner.commitTransaction();
      this.invalidate();
      return results;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  /** 批量更新：接收 { key: value } 对象（按 key 查，不限 group） */
  async batchUpdate(
    items: Record<string, string>,
    operator?: SettingOperator,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const results: SettingEntity[] = [];
      for (const [key, value] of Object.entries(items)) {
        const existing = await queryRunner.manager.findOne(SettingEntity, { where: { key } });
        if (existing) {
          this.logChange(existing, value, operator);
          const toSave = { ...existing, value };
          results.push(await queryRunner.manager.save(SettingEntity, toSave));
        }
      }
      await queryRunner.commitTransaction();
      this.invalidate();
      return results;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }
}

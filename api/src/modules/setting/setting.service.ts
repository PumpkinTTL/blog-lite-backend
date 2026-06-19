import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingEntity } from './setting.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

/** 操作者信息（审计用，controller 从 req.user 传入） */
export interface SettingOperator {
  id?: number;
  name?: string;
}

@Injectable()
export class SettingService {
  constructor(
    @InjectRepository(SettingEntity)
    private readonly repo: Repository<SettingEntity>,
    // AuditLogModule 是 @Global，可直接注入；@Optional 兼容测试环境
    @Optional() private readonly auditLog?: AuditLogService,
  ) {}

  /** 记录配置变更审计（value 变化时） */
  private logChange(
    existing: SettingEntity,
    newValue: string,
    operator?: SettingOperator,
  ) {
    if (!this.auditLog) return;
    if (existing.value === newValue) return;
    this.auditLog
      .log({
        targetType: 'setting',
        targetId: existing.id,
        field: existing.key,
        oldValue: existing.value,
        newValue,
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
    return this.repo.findOne({ where: { key } });
  }

  async create(data: Partial<SettingEntity>, operator?: SettingOperator) {
    const entity = this.repo.create(data);
    const saved = await this.repo.save(entity);
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
    return this.repo.find({ where: { group }, order: { key: 'ASC' } });
  }

  async batchUpdateByGroup(
    group: string,
    items: Record<string, string>,
    operator?: SettingOperator,
  ) {
    const results: SettingEntity[] = [];
    for (const [key, value] of Object.entries(items)) {
      const existing = await this.repo.findOne({ where: { key, group } });
      if (existing) {
        this.logChange(existing, value, operator);
        existing.value = value;
        results.push(await this.repo.save(existing));
      } else {
        // key 不存在则创建（upsert 语义，供 rate_limit 等动态配置首次写入）
        const created = this.repo.create({ key, value, group });
        results.push(await this.repo.save(created));
      }
    }
    return results;
  }

  /** 批量更新：接收 { key: value } 对象 */
  async batchUpdate(
    items: Record<string, string>,
    operator?: SettingOperator,
  ) {
    const results: SettingEntity[] = [];
    for (const [key, value] of Object.entries(items)) {
      const existing = await this.findByKey(key);
      if (existing) {
        this.logChange(existing, value, operator);
        existing.value = value;
        results.push(await this.repo.save(existing));
      }
    }
    return results;
  }
}

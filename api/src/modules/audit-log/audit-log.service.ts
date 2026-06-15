import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity, AuditTargetType } from './audit-log.entity';

export interface AuditLogEntry {
  targetType: AuditTargetType; targetId: number; field: string;
  oldValue?: string | null; newValue?: string | null;
  operatorId?: number | null; operatorName?: string | null;
  targetName?: string | null; note?: string | null;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  constructor(@InjectRepository(AuditLogEntity) private readonly repo: Repository<AuditLogEntity>) {}

  async logMany(entries: AuditLogEntry[]) {
    if (!entries.length) return;
    await this.repo.save(entries.map((e) => this.repo.create({
      targetType: e.targetType, targetId: e.targetId, field: e.field,
      oldValue: e.oldValue ?? null, newValue: e.newValue ?? null,
      operatorId: e.operatorId ?? null, operatorName: e.operatorName ?? null,
      targetName: e.targetName ?? null, note: e.note ?? null,
    })));
  }

  async log(entry: AuditLogEntry) { return this.logMany([entry]); }

  async findByTarget(type: AuditTargetType, id: number, page = 1, pageSize = 20) {
    const [list, total] = await this.repo.findAndCount({
      where: { targetType: type, targetId: id },
      order: { createdAt: 'DESC' }, skip: (page - 1) * pageSize, take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async findAll(page = 1, pageSize = 20) {
    const [list, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' }, skip: (page - 1) * pageSize, take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  static diff(
    targetType: AuditTargetType, targetId: number,
    before: Record<string, any>, after: Record<string, any>, fields: string[],
    opts?: { operatorId?: number | null; operatorName?: string | null; targetName?: string | null; note?: string | null },
  ): AuditLogEntry[] {
    const entries: AuditLogEntry[] = [];
    for (const f of fields) {
      const ov = before[f] != null ? String(before[f]) : null;
      const nv = after[f] != null ? String(after[f]) : null;
      if (ov !== nv) entries.push({
        targetType, targetId, field: f, oldValue: ov, newValue: nv,
        operatorId: opts?.operatorId, operatorName: opts?.operatorName,
        targetName: opts?.targetName, note: opts?.note,
      });
    }
    return entries;
  }
}

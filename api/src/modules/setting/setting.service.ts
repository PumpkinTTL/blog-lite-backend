import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingEntity } from './setting.entity';

@Injectable()
export class SettingService {
  constructor(
    @InjectRepository(SettingEntity)
    private readonly repo: Repository<SettingEntity>,
  ) {}

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

  async create(data: Partial<SettingEntity>) {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async updateByKey(key: string, value: string) {
    await this.repo.update({ key }, { value });
    return this.findByKey(key);
  }

  async updateById(id: number, data: Partial<SettingEntity>) {
    await this.repo.update(id, data);
    return this.repo.findOne({ where: { id } });
  }

  async remove(id: number) {
    await this.repo.delete(id);
  }

  async findByGroup(group: string) {
    return this.repo.find({ where: { group }, order: { key: 'ASC' } });
  }

  async batchUpdateByGroup(group: string, items: Record<string, string>) {
    const results: SettingEntity[] = [];
    for (const [key, value] of Object.entries(items)) {
      const existing = await this.repo.findOne({ where: { key, group } });
      if (existing) {
        existing.value = value;
        results.push(await this.repo.save(existing));
      }
    }
    return results;
  }

  /** 批量更新：接收 { key: value } 对象 */
  async batchUpdate(items: Record<string, string>) {
    const results: SettingEntity[] = [];
    for (const [key, value] of Object.entries(items)) {
      const existing = await this.findByKey(key);
      if (existing) {
        existing.value = value;
        results.push(await this.repo.save(existing));
      }
    }
    return results;
  }
}

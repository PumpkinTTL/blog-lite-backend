import { Injectable, OnModuleInit, Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { BackupService } from './backup.service';
import type { BackupScheduleConfig } from './backup.service';
import { SettingService } from '../setting/setting.service';

/**
 * 备份定时器调度服务：动态管理多个 cron job
 *
 * - 配置存 settings 表（group=backup），key=backup_schedule_<id>
 * - 启动时 load() 读所有定时器配置 → 注册 cron job
 * - 增删改定时器 → 更新 settings + 动态增删 cron job（不停机）
 * - 暂停/恢复 → 切 enabled + 重新注册该 job
 *
 * cron 表达式从预设配置转换（见 toCronExpression 方法）：
 * - interval: 每 N 分钟 → (星号-斜杠-N 分 时 日 月 周)
 * - daily:     每天 hour:minute → (分 时 日 月 周，日/月/周为星号)
 * - weekly:    每周 dayOfWeek hour:minute → (分 时 日 月 周，周为具体数字)
 */
@Injectable()
export class BackupScheduleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupScheduleService.name);
  /** 内存缓存：id → 配置（避免每次都查库） */
  private configs = new Map<string, BackupScheduleConfig>();
  /** 定时备份执行中标记（跨所有定时器互斥，防重叠） */

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly backupService: BackupService,
    private readonly settingService: SettingService,
  ) {}

  async onModuleInit() {
    await this.loadAll();
  }

  // ──────────────── 配置持久化 ────────────────
  //
  // 架构原则：DB 是唯一真相源，内存 configs Map 仅作为「id → 配置」索引供
  // cron job 注册/查询使用。所有对外读方法（list/getById）都直接查 DB，
  // 写方法（create/update/remove）写完 DB 后同步刷新内存。
  // 这样避免「内存与 DB 脱节导致 list 返回脏数据 / toggle 丢字段」的问题。

  private settingKey(id: string): string {
    return `backup_schedule_${id}`;
  }

  /**
   * 规范化配置：补全缺失字段 + 校验枚举值。
   *
   * 防御历史脏数据（早期版本只存了 {id, enabled}，缺少 name/type/retainDays 等）。
   * 任何时刻写进 DB 或内存的对象都经此方法处理，保证字段完整、类型合法。
   */
  private normalizeConfig(cfg: Partial<BackupScheduleConfig>): BackupScheduleConfig {
    const validTypes: BackupScheduleConfig['type'][] = ['interval', 'daily', 'weekly'];
    const type = validTypes.includes(cfg.type as any) ? cfg.type! : 'daily';
    return {
      id: cfg.id || `s${Date.now().toString(36)}`,
      name: cfg.name || '未命名定时器',
      enabled: cfg.enabled ?? true,
      type,
      // 按 type 给出合理默认值，避免 undefined 导致 cron 解析或表格渲染异常
      intervalMinutes: typeof cfg.intervalMinutes === 'number' ? cfg.intervalMinutes : 60,
      hour: typeof cfg.hour === 'number' ? cfg.hour : 3,
      minute: typeof cfg.minute === 'number' ? cfg.minute : 0,
      dayOfWeek: typeof cfg.dayOfWeek === 'number' ? cfg.dayOfWeek : 1,
      retainDays: typeof cfg.retainDays === 'number' && cfg.retainDays > 0 ? cfg.retainDays : 30,
    };
  }

  /** 直接从 DB 读所有定时器配置（始终返回完整、规范化的对象） */
  private async loadFromDb(): Promise<BackupScheduleConfig[]> {
    const all = await this.settingService.findByGroup('backup');
    const result: BackupScheduleConfig[] = [];
    for (const item of all) {
      if (!item.key.startsWith('backup_schedule_')) continue;
      try {
        const raw = JSON.parse(item.value) as Partial<BackupScheduleConfig>;
        result.push(this.normalizeConfig(raw));
      } catch {
        this.logger.warn(`解析定时器配置失败: ${item.key}`);
      }
    }
    return result;
  }

  /**
   * 启动时加载：读 DB → 填充内存索引 → 注册所有 enabled 的 cron job。
   * 只在 onModuleInit 调用一次。
   */
  async loadAll(): Promise<BackupScheduleConfig[]> {
    const list = await this.loadFromDb();
    this.configs.clear();
    for (const cfg of list) {
      this.configs.set(cfg.id, cfg);
      if (!cfg.enabled) continue;
      try {
        this.registerJob(cfg);
      } catch (e) {
        // 手改 settings 的脏数据（如 intervalMinutes=0 → */0）只跳过该条，不拖死启动
        this.logger.error(
          `定时器「${cfg.name}」(${cfg.id}) cron 表达式非法，已跳过: ${(e as Error).message}`,
        );
      }
    }
    const enabledCount = list.filter((c) => c.enabled).length;
    this.logger.log(`加载 ${list.length} 个备份定时器（${enabledCount} 个启用）`);
    return list;
  }

  /** 列出所有定时器（直接查 DB，保证与持久化状态一致） */
  async list(): Promise<BackupScheduleConfig[]> {
    const list = await this.loadFromDb();
    // 同步刷新内存索引（便于 cron 查询 getNextRun 等）
    this.configs.clear();
    for (const cfg of list) this.configs.set(cfg.id, cfg);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(id: string): Promise<BackupScheduleConfig> {
    const all = await this.loadFromDb();
    const cfg = all.find((c) => c.id === id);
    if (!cfg) throw new Error(`定时器 ${id} 不存在`);
    return cfg;
  }

  /** 新增定时器 */
  async create(cfg: Partial<BackupScheduleConfig> & { name: string; type: BackupScheduleConfig['type']; retainDays: number }): Promise<BackupScheduleConfig> {
    const id = `s${Date.now().toString(36)}`;
    const full = this.normalizeConfig({ ...cfg, id });
    await this.settingService.batchUpdateByGroup('backup', {
      [this.settingKey(id)]: JSON.stringify(full),
    });
    this.configs.set(id, full);
    if (full.enabled) this.registerJob(full);
    this.logger.log(`新建备份定时器: ${full.name} (${full.id})`);
    return full;
  }

  /** 更新定时器（包括启停） */
  async update(id: string, patch: Partial<BackupScheduleConfig>): Promise<BackupScheduleConfig> {
    // 从 DB 读现状（不信任内存缓存，避免脏数据 merge 后丢字段）
    const existing = await this.getById(id);
    const updated = this.normalizeConfig({ ...existing, ...patch, id });
    await this.settingService.batchUpdateByGroup('backup', {
      [this.settingKey(id)]: JSON.stringify(updated),
    });
    this.configs.set(id, updated);
    // 重新注册（先删旧的再加新的）
    this.unregisterJob(id);
    if (updated.enabled) this.registerJob(updated);
    this.logger.log(`更新备份定时器: ${updated.name} (${id})`);
    return updated;
  }

  /** 删除定时器（即使内存索引没有，也确保 DB 记录被清掉） */
  async remove(id: string): Promise<void> {
    // 先从 DB 确认存在（不存在则静默返回，幂等）
    let cfg = this.configs.get(id);
    if (!cfg) {
      try { cfg = await this.getById(id); } catch { return; }
    }
    this.unregisterJob(id);
    this.configs.delete(id);
    const setting = await this.settingService.findByKey(this.settingKey(id));
    if (setting) {
      await this.settingService.remove(setting.id);
    }
    this.logger.log(`删除备份定时器: ${cfg.name} (${id})`);
  }

  // ──────────────── cron job 注册/注销 ────────────────

  /** 配置 → cron 表达式 */
  private toCronExpression(cfg: BackupScheduleConfig): string {
    const m = cfg.minute ?? 0;
    const h = cfg.hour ?? 3;
    switch (cfg.type) {
      case 'interval': {
        // cron 分钟域步进上限 59：N>59 时 cron 4.x 不报错但静默退化为"每小时整点"
        // （*/1440 的"每天"实际每小时 dump）。换算到小时/天域。
        const mins = cfg.intervalMinutes ?? 60;
        if (mins <= 59) return `*/${mins} * * * *`;
        if (mins % 60 === 0 && mins / 60 <= 23) return `0 */${mins / 60} * * *`;
        // 不足整小时（如 90min）或超过 24h：用秒级补偿不可行（cron 无秒），
        // 保守取"每 N 小时"整点近似并告警
        const hours = Math.max(1, Math.round(mins / 60));
        if (hours <= 23) {
          this.logger.warn(
            `定时器「${cfg.name}」间隔 ${mins} 分钟非整小时，已近似为每 ${hours} 小时执行`,
          );
          return `0 */${hours} * * *`;
        }
        this.logger.warn(
          `定时器「${cfg.name}」间隔 ${mins} 分钟超过一天，已降级为每天 03:00 执行`,
        );
        return '0 3 * * *';
      }
      case 'weekly':
        return `${m} ${h} * * ${cfg.dayOfWeek ?? 0}`;
      case 'daily':
      default:
        return `${m} ${h} * * *`;
    }
  }

  private jobName(id: string): string {
    return `backup_${id}`;
  }

  private registerJob(cfg: BackupScheduleConfig): void {
    if (!cfg.enabled) return;
    const cron = this.toCronExpression(cfg);
    // 时区固定 Asia/Shanghai：cron 默认取服务器本地时区，生产机为 UTC 时
    // "每天 3:00"实际是北京上午 11 点执行（与 DB 连接层 +08:00 的假设错位）
    const job = new CronJob(cron, async () => {
      // 重叠保护：BackupService 内部持有"真正执行期"的锁（runBackup 撞锁会抛
      // ConflictException），这里先查忙再调，只为了日志友好——真正的防线在
      // BackupService（此前这把 this.running 假锁在 fire-and-forget 返回后毫秒级
      // 复位，形同虚设，手动触发更是完全不经过这里）。
      if (this.backupService.isBusy()) {
        this.logger.warn(
          `定时器「${cfg.name}」触发时上一轮备份仍在执行，本轮跳过`,
        );
        return;
      }
      this.logger.log(`定时器「${cfg.name}」触发备份`);
      // retainDays 透传：executeBackup 成功分支内清理（返回值 status 恒为 running，
      // 在这里判 success 是死代码，清理从未执行过——已修）
      await this.backupService.runBackup('schedule', cfg.name, cfg.retainDays);
    }, null, false, 'Asia/Shanghai');
    this.schedulerRegistry.addCronJob(this.jobName(cfg.id), job as any);
    job.start();
    this.logger.log(`注册 cron job「${cfg.name}」: ${cron}`);
  }

  /** 优雅停机：动态 CronJob 持有事件循环引用，@nestjs/schedule 6.x 不代停动态 job，
   *  不停的话 SIGTERM 后 graceful close 完成进程仍不退出，等编排层 SIGKILL */
  onModuleDestroy() {
    for (const cfg of this.configs.values()) {
      try {
        this.schedulerRegistry.deleteCronJob(this.jobName(cfg.id));
      } catch { /* 已注销则忽略 */ }
    }
    this.configs.clear();
  }

  private unregisterJob(id: string): void {
    const name = this.jobName(id);
    try {
      this.schedulerRegistry.deleteCronJob(name);
      this.logger.log(`注销 cron job: ${name}`);
    } catch {
      // job 不存在（可能从没注册过），忽略
    }
  }

  /** 下次触发时间（admin 展示用） */
  getNextRun(id: string): Date | null {
    const cfg = this.configs.get(id);
    if (!cfg || !cfg.enabled) return null;
    try {
      const cron = this.toCronExpression(cfg);
      const temp = new CronJob(cron, () => {}, null, false, 'Asia/Shanghai');
      return temp.nextDate().toJSDate();
    } catch {
      return null;
    }
  }
}

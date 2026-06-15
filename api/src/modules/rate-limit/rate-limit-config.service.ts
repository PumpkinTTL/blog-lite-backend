import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** 单条限流规则 */
export interface RateRule {
  limit: number; // 窗口内最大请求次数
  ttl: number; // 窗口时长（毫秒）
}

/** 敏感接口的元信息（供 GUI 展示） */
export interface RateRuleMeta extends RateRule {
  routeKey: string; // 类名.方法名
  label: string; // 中文说明
}

const RATE_LIMIT_GROUP = 'rate_limit';

/** 全局默认阈值（settings 表无数据时 fallback） */
const FALLBACK_DEFAULT: RateRule = { limit: 100, ttl: 60000 };

/** 敏感接口默认配置（首次启动 seed 进 settings 表） */
const SENSITIVE_DEFAULTS: RateRuleMeta[] = [
  { routeKey: 'UserController.login', label: '登录', limit: 5, ttl: 60000 },
  { routeKey: 'UserController.register', label: '注册', limit: 5, ttl: 60000 },
  { routeKey: 'UserController.clientLogin', label: '客户端登录', limit: 5, ttl: 60000 },
  { routeKey: 'UserController.sendResetCode', label: '发送验证码', limit: 3, ttl: 3600000 },
  { routeKey: 'UserController.resetPasswordByCode', label: '验证码重置密码', limit: 5, ttl: 3600000 },
  { routeKey: 'CommentController.create', label: '发表评论', limit: 10, ttl: 60000 },
];

/**
 * 限流配置服务：内存配置 + DB 持久化 + 热更新
 *
 * - settings 表为真相源（持久化，宕机不丢）
 * - 启动时 load() 读一次表填进内存
 * - Guard 每请求读内存（零开销）
 * - GUI 改配置 → 写表 + reload() 刷内存（热生效，不停机）
 */
@Injectable()
export class RateLimitConfigService implements OnModuleInit {
  private readonly logger = new Logger(RateLimitConfigService.name);
  /** 全局默认阈值 */
  private defaultRule: RateRule = { ...FALLBACK_DEFAULT };
  /** 敏感接口规则 Map（routeKey → rule） */
  private rules = new Map<string, RateRule>();
  /** 敏感接口元信息（label 等，供 GUI 展示，不变动） */
  private readonly metas = SENSITIVE_DEFAULTS;

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.load();
  }

  /** 从 settings 表加载配置到内存（启动时 + reload 时调） */
  async load() {
    try {
      const rows: Array<{ key: string; value: string }> =
        await this.dataSource.query(
          'SELECT `key`, `value` FROM `settings` WHERE `group` = ?',
          [RATE_LIMIT_GROUP],
        );
      const map = new Map(rows.map((r) => [r.key, r.value]));

      // 全局默认
      const dl = map.get('default.limit');
      const dt = map.get('default.ttl');
      if (dl && dt) {
        this.defaultRule = { limit: Number(dl), ttl: Number(dt) };
      }

      // 敏感接口（key 格式：rule.<routeKey>.limit / .ttl）
      this.rules.clear();
      for (const meta of this.metas) {
        const rl = map.get(`rule.${meta.routeKey}.limit`);
        const rt = map.get(`rule.${meta.routeKey}.ttl`);
        if (rl && rt) {
          this.rules.set(meta.routeKey, { limit: Number(rl), ttl: Number(rt) });
        }
      }

      // 首次启动：表里没数据 → seed 默认值
      if (rows.length === 0) {
        await this.seed();
      }

      this.logger.log(
        `限流配置已加载：全局默认 ${this.defaultRule.limit}/${this.defaultRule.ttl}ms，敏感接口 ${this.rules.size} 条`,
      );
    } catch (err) {
      this.logger.error(`加载限流配置失败，使用 fallback 默认值: ${(err as Error).message}`);
    }
  }

  /** 首次启动 seed 默认值到 settings 表 */
  private async seed() {
    const items: Array<{ key: string; value: string; description: string }> = [
      { key: 'default.limit', value: String(FALLBACK_DEFAULT.limit), description: '全局默认请求次数' },
      { key: 'default.ttl', value: String(FALLBACK_DEFAULT.ttl), description: '全局默认时间窗口(ms)' },
    ];
    for (const m of this.metas) {
      items.push(
        { key: `rule.${m.routeKey}.limit`, value: String(m.limit), description: `${m.label}请求次数` },
        { key: `rule.${m.routeKey}.ttl`, value: String(m.ttl), description: `${m.label}时间窗口(ms)` },
      );
    }
    for (const item of items) {
      await this.dataSource.query(
        'INSERT IGNORE INTO `settings` (`key`, `value`, `description`, `group`) VALUES (?, ?, ?, ?)',
        [item.key, item.value, item.description, RATE_LIMIT_GROUP],
      );
    }
    this.logger.log(`已 seed 限流默认配置 ${items.length} 条`);
  }

  /** Guard 调用：取某路由的阈值，找不到回退全局默认 */
  getRule(routeKey: string): RateRule {
    return this.rules.get(routeKey) ?? this.defaultRule;
  }

  /** GUI 读取：返回完整配置（全局默认 + 敏感接口列表） */
  getConfig() {
    return {
      default: this.defaultRule,
      rules: this.metas.map((m) => ({
        routeKey: m.routeKey,
        label: m.label,
        ...(this.rules.get(m.routeKey) ?? { limit: m.limit, ttl: m.ttl }),
      })),
    };
  }

  /**
   * GUI 保存：写入 settings 表 + 刷新内存
   * @param defaultRule 全局默认
   * @param rules 敏感接口配置 [{ routeKey, limit, ttl }]
   */
  async saveConfig(defaultRule: RateRule, rules: Array<RateRuleMeta>) {
    const items: Record<string, string> = {
      'default.limit': String(defaultRule.limit),
      'default.ttl': String(defaultRule.ttl),
    };
    for (const r of rules) {
      items[`rule.${r.routeKey}.limit`] = String(r.limit);
      items[`rule.${r.routeKey}.ttl`] = String(r.ttl);
    }

    // upsert：key 存在则更新，不存在则插入
    for (const [key, value] of Object.entries(items)) {
      await this.dataSource.query(
        'INSERT INTO `settings` (`key`, `value`, `group`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, value, RATE_LIMIT_GROUP],
      );
    }

    // 刷新内存
    await this.load();
    this.logger.log(`限流配置已更新（热生效）：全局 ${defaultRule.limit}/${defaultRule.ttl}ms`);
  }
}

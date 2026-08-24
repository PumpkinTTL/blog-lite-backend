import { Controller, Get } from '@nestjs/common';
import { SettingService } from './setting.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * 前台公开站点设置接口（@Public）。
 * 与 admin 的 SettingController（@Roles('admin')）分离，避免类装饰器冲突。
 *
 * 安全要点：
 * - 这里是【白名单】输出：只返回明确列出的 key，不直接 findByGroup('site')。
 *   原因：settings 表里 group='site' 也可能被人为塞入敏感值（如密钥、邮箱密码），
 *   动态返回整个 group 会泄漏。硬编码字段映射是最后一道防线。
 * - turnstile 只返回 site_key（公开），绝不返回 secret_key。
 * - 所有字段经过类型转换（字符串 → bool/number/JSON），前端无需重复 parse。
 */
@Controller('setting')
export class SettingPublicController {
  constructor(private readonly service: SettingService) {}

  /** 字符串 → boolean，仅 'true'/'1' 为真（大小写不敏感，trim 后判定） */
  private toBool(v: string | undefined | null): boolean {
    const s = v?.trim().toLowerCase();
    return s === 'true' || s === '1';
  }

  private toBoolWithDefault(v: string | undefined | null, defaultTrue: boolean): boolean {
    if (v == null || v.trim() === '') return defaultTrue;
    return this.toBool(v);
  }

  private toNumberWithFallback(v: string | undefined | null, fallback: number): number {
    if (v == null || v.trim() === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  /** 安全 parse JSON，失败返回 fallback（不抛错，避免单个坏值拖垮整个接口） */
  private toJson<T>(v: string | undefined | null, fallback: T): T {
    if (!v) return fallback;
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }

  @Public()
  @Get('public/site')
  async getPublicSiteSettings() {
    // 从 SettingService 内存缓存按 key 取值（零 DB I/O，findByKey 走 loadCache 内存 Map）
    const get = async (key: string) => (await this.service.findByKey(key))?.value;

    const data = {
      siteName: (await get('site.name')) || '慢成长',
      siteTitle: (await get('site.title')) || '慢成长',
      siteSubtitle: (await get('site.subtitle')) || 'Slow Growth',
      siteDescription: (await get('site.description')) || '',
      logoUrl: (await get('site.logo_url')) || '',
      faviconUrl: (await get('site.favicon_url')) || '',
      contactEmail: (await get('site.contact_email')) || '',
      shopUrl: (await get('site.shop_url')) || '',
      socialLinks: this.toJson(await get('site.social_links'), {
        github: '',
        x: '',
        telegram: '',
        rss: '',
      }),
      donationEnabled: this.toBoolWithDefault(await get('donation.enabled'), true),
      donationUsdtRate: this.toNumberWithFallback(await get('donation.usdt_rate'), 7),
      donationWalletAddresses: this.toJson(await get('donation.wallet_addresses'), {
        TRC20: '',
        BSC: '',
        POL: '',
      }),
      turnstileEnabled: this.toBool(await get('turnstile.enabled')),
      turnstileSiteKey: (await get('turnstile.site_key')) || '',
      // 注册设置（前端据此隐藏注册入口 + 邮箱白名单提示）
      registrationEnabled: this.toBoolWithDefault(await get('registration.enabled'), true),
      registrationRequireInvitation: this.toBoolWithDefault(
        await get('registration.require_invitation'),
        true,
      ),
      registrationEmailWhitelist: (await get('registration.email_whitelist')) || '',
      // 维护模式（前端可据此提示"站点维护中"）
      maintenanceEnabled: this.toBool(await get('maintenance.enabled')),
      // 模块开关（前端据此隐藏 UI，后端接口也拒绝，防绕过）
      commentsEnabled: this.toBoolWithDefault(await get('comments.enabled'), true),
      announcementsEnabled: this.toBoolWithDefault(await get('announcements.enabled'), true),
      adsEnabled: this.toBoolWithDefault(await get('ads.enabled'), true),
    };

    return { success: true, data, message: 'ok' };
  }
}

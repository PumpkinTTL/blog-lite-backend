import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { SettingService } from './setting.service';
import {
  CreateSettingDto,
  UpdateSettingDto,
  BatchUpdateSettingDto,
} from './setting.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { MailerService } from '../mailer/mailer.service';

/** 从 req.user 提取操作者信息（审计用） */
function getOperator(req: Request) {
  const user = (req as any)?.user;
  return {
    id: user?.sub ? Number(user.sub) : undefined,
    name: user?.nickname,
  };
}

@Controller('setting')
@Roles('admin')
export class SettingController {
  constructor(
    private readonly service: SettingService,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * 当前生效的 SMTP / R2 配置概要（设置面板展示用）。
   * 面板值优先、.env 兜底，标明来源；密钥只回脱敏信息。
   */
  @Get('effective-config')
  async effectiveConfig() {
    const db = async (k: string) =>
      ((await this.service.findByKey(k))?.value ?? '').trim();

    // ── SMTP ──
    const [pHost, pPort, pUser, pPass, pFrom] = await Promise.all([
      db('smtp.host'),
      db('smtp.port'),
      db('smtp.user'),
      db('smtp.pass'),
      db('smtp.from'),
    ]);
    const smtpSource = pHost ? 'panel' : process.env.SMTP_HOST ? 'env' : 'none';
    const smtp = {
      source: smtpSource,
      host: pHost || process.env.SMTP_HOST || '',
      port: Number(pPort || process.env.SMTP_PORT || '') || 0,
      user: pUser || process.env.SMTP_USER || '',
      from: pFrom || process.env.SMTP_FROM || '',
      hasPass: !!(pPass || process.env.SMTP_PASS),
    };

    // ── R2 ──
    const accountsRaw = await db('storage.r2.accounts');
    const activeId = await db('storage.r2.active_id');
    let r2: {
      source: 'panel' | 'env' | 'none';
      accountName?: string;
      endpoint?: string;
      bucket?: string;
      prefix?: string;
      keyMasked?: string;
    } = { source: 'none' };
    try {
      const list = accountsRaw ? JSON.parse(accountsRaw) : [];
      const enabled = Array.isArray(list)
        ? list.filter((a: any) => a && a.enabled !== false)
        : [];
      const active =
        enabled.find((a: any) => a.id === activeId) ?? enabled[0];
      if (active) {
        const endpoint = /^https?:\/\//i.test(active.accountId || '')
          ? active.accountId
          : `https://${active.accountId}.r2.cloudflarestorage.com`;
        r2 = {
          source: 'panel',
          accountName: active.name || active.id,
          endpoint,
          bucket: active.bucket || '',
          prefix: active.prefix || '',
          keyMasked: active.accessKeyId
            ? String(active.accessKeyId).slice(0, 6) + '***'
            : '',
        };
      } else if (process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET) {
        r2 = {
          source: 'env',
          accountName: '.env 配置',
          endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          bucket: process.env.R2_BUCKET,
          prefix: '',
          keyMasked: process.env.R2_ACCESS_KEY_ID
            ? String(process.env.R2_ACCESS_KEY_ID).slice(0, 6) + '***'
            : '',
        };
      }
    } catch {
      // accounts JSON 解析失败按未配置处理
    }

    // ── Tavily ──
    const [tKey, tUrl] = await Promise.all([db('ai.tavily_key'), db('ai.tavily_url')]);
    const tavily = {
      source: tKey ? 'panel' : process.env.TAVILY_API_KEY ? 'env' : 'none',
      keyMasked: (tKey || process.env.TAVILY_API_KEY || '')
        ? (tKey || process.env.TAVILY_API_KEY || '').slice(0, 8) + '***'
        : '',
      baseUrl: tUrl || process.env.TAVILY_BASE_URL || 'https://api.tavily.com',
    };

    return { success: true, data: { smtp, r2, tavily }, message: 'ok' };
  }

  @Get()
  async list() {
    const data = await this.service.findAll();
    return { success: true, data, message: 'ok' };
  }

  /**
   * 测试 SMTP 发送（系统设置面板「测试发送」按钮）。
   * override 传表单当前值：未保存也能测；空字段回落已保存配置/.env。
   */
  @Post('test-smtp')
  async testSmtp(
    @Body()
    dto: {
      to: string;
      host?: string;
      port?: number | string;
      user?: string;
      pass?: string;
      from?: string;
    },
  ) {
    // 收件人兜底链：表单填的 → 表单 SMTP 用户名 → 已生效 SMTP 用户名 → 站点联系邮箱
    // 测试发送的默认语义就是"发给自己"，不填也能测。
    let to = (dto?.to || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) {
      const panelUser = (dto?.user || '').trim();
      const savedUser = (
        (await this.service.findByKey('smtp.user'))?.value || ''
      ).trim();
      const envUser = process.env.SMTP_USER || '';
      const contactEmail = (
        (await this.service.findByKey('site.contact_email'))?.value || ''
      ).trim();
      to =
        [panelUser, savedUser, envUser, contactEmail].find((v) =>
          /^\S+@\S+\.\S+$/.test(v),
        ) ?? '';
    }
    if (!to) {
      return {
        success: false,
        data: {
          ok: false,
          message: '无法确定测试收件邮箱：请填写，或配置 SMTP 用户名/站点联系邮箱',
        },
        message: 'invalid to',
      };
    }
    const result = await this.mailerService.sendTestMail(to, {
      host: dto.host || '',
      port: Number(dto.port) || 0,
      user: dto.user || '',
      pass: dto.pass || '',
      from: dto.from || '',
    });
    return { success: true, data: result, message: 'ok' };
  }

  @Get('group/:group')
  async getByGroup(@Param('group') group: string) {
    const data = await this.service.findByGroup(group);
    return { success: true, data, message: 'ok' };
  }

  @Put('group/:group')
  async batchUpdateByGroup(
    @Param('group') group: string,
    @Body() dto: BatchUpdateSettingDto,
    @Req() req: Request,
  ) {
    const data = await this.service.batchUpdateByGroup(
      group,
      dto.items,
      getOperator(req),
    );
    return { success: true, data, message: '更新成功' };
  }

  @Get(':key')
  async getByKey(@Param('key') key: string) {
    const data = await this.service.findByKey(key);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreateSettingDto, @Req() req: Request) {
    const data = await this.service.create(dto, getOperator(req));
    return { success: true, data, message: '创建成功' };
  }

  @Put('batch')
  async batchUpdate(@Body() dto: BatchUpdateSettingDto, @Req() req: Request) {
    const data = await this.service.batchUpdate(dto.items, getOperator(req));
    return { success: true, data, message: '更新成功' };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSettingDto,
    @Req() req: Request,
  ) {
    const data = await this.service.updateById(id, dto, getOperator(req));
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    await this.service.remove(id, getOperator(req));
    return { success: true, message: '删除成功' };
  }
}

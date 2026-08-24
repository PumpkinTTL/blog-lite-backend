import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { renderVerifyCode } from './templates';
import { SettingService } from '../setting/setting.service';

/** 解析后的 SMTP 配置（数据库 smtp.* 优先，空字段回落 .env） */
interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;
  /** transporter 对应的配置签名，配置变更时重建连接 */
  private transporterSig = '';

  constructor(
    private readonly configService: ConfigService,
    private readonly settingService: SettingService,
  ) {}

  /**
   * 解析 SMTP 配置：系统设置面板（smtp.*）优先，空字段回落 .env。
   * 面板保存后 SettingService 缓存失效，下次发信即用新配置（无需重启）。
   */
  private async resolveSmtpConfig(): Promise<SmtpConfig | null> {
    const db = async (key: string) =>
      ((await this.settingService.findByKey(key))?.value ?? '').trim();

    const [host, port, user, pass, from] = await Promise.all([
      db('smtp.host'),
      db('smtp.port'),
      db('smtp.user'),
      db('smtp.pass'),
      db('smtp.from'),
    ]);

    const cfg: SmtpConfig = {
      host: host || this.configService.get<string>('SMTP_HOST') || '',
      // 端口必须转 number：'465'（字符串）时 secure 判断会失效，
      // 导致用明文 STARTTLS 连 465 SSL 端口 → 握手超时
      port: Number(port || this.configService.get<string>('SMTP_PORT')) || 465,
      user: user || this.configService.get<string>('SMTP_USER') || '',
      pass: pass || this.configService.get<string>('SMTP_PASS') || '',
      from: from || this.configService.get<string>('SMTP_FROM') || '',
    };

    if (!cfg.host || !cfg.user || !cfg.pass) return null;
    return cfg;
  }

  /** 获取 transporter（懒创建 + 配置变更时重建） */
  private async getTransporter(): Promise<{
    transporter: nodemailer.Transporter;
    config: SmtpConfig;
  } | null> {
    const cfg = await this.resolveSmtpConfig();
    if (!cfg) {
      if (this.transporter) {
        this.transporter.close();
        this.transporter = null;
        this.transporterSig = '';
      }
      return null;
    }

    const sig = JSON.stringify(cfg);
    if (!this.transporter || sig !== this.transporterSig) {
      this.transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });
      this.transporterSig = sig;
      this.logger.log(
        `SMTP 已配置: ${cfg.host}:${cfg.port} (secure=${cfg.port === 465})`,
      );
    }
    return { transporter: this.transporter, config: cfg };
  }

  /**
   * 发送测试邮件（系统设置面板「测试发送」按钮）。
   * override 为表单当前值（未保存也能测）：非空字段覆盖已生效配置，空字段回落。
   * 用一次性 transporter，不影响正常发信的连接缓存。
   */
  async sendTestMail(
    to: string,
    override?: Partial<SmtpConfig>,
  ): Promise<{ ok: boolean; message: string }> {
    const base = await this.resolveSmtpConfig();
    const cfg: SmtpConfig = {
      host: override?.host?.trim() || base?.host || '',
      port: Number(override?.port) || base?.port || 465,
      user: override?.user?.trim() || base?.user || '',
      pass: override?.pass || base?.pass || '',
      from: override?.from?.trim() || base?.from || '',
    };
    if (!cfg.host || !cfg.user || !cfg.pass) {
      return {
        ok: false,
        message:
          'SMTP 未配置：请填写服务器/用户名/密码（或服务器 .env 配置 SMTP_*）',
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
      await transporter.sendMail({
        from: cfg.from || `"Blog Lite" <${cfg.user}>`,
        to,
        subject: '【测试】SMTP 配置验证',
        html: '<p>这是一封测试邮件。收到它说明 SMTP 配置正确。</p>',
      });
      transporter.close();
      return { ok: true, message: `测试邮件已发送至 ${to}，请查收` };
    } catch (error) {
      const code = error?.code || '';
      let reason: string;
      if (code === 'EAUTH' || code === '535') {
        reason = '认证失败：用户名或密码/授权码错误';
      } else if (
        code === 'ETIMEDOUT' ||
        code === 'ECONNTIMEOUT' ||
        code === 'ESOCKET'
      ) {
        reason = `连接超时：服务器地址或端口不对（${cfg.host}:${cfg.port}）`;
      } else if (code === 'ECONNECTION' || code === 'ECONNREFUSED') {
        reason = `无法连接 ${cfg.host}:${cfg.port}：地址或端口不对`;
      } else if (code === 'EDNS' || code === 'ENOTFOUND') {
        reason = `域名无法解析：${cfg.host}`;
      } else if (code === 'EMESSAGE') {
        reason = '邮件被拒收：收件邮箱格式可能不正确';
      } else {
        reason = `${code ? code + '：' : ''}${(error?.message || '未知错误').slice(0, 120)}`;
      }
      return { ok: false, message: `发送失败 → ${reason}` };
    }
  }

  /**
   * 发送邮件
   */
  async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    const t = await this.getTransporter();
    if (!t) {
      this.logger.error(
        'SMTP 未配置，无法发送邮件（系统设置 → 邮件通知，或 .env SMTP_*）',
      );
      return false;
    }

    const from = t.config.from || `"观书星" <${t.config.user}>`;

    try {
      const result = await t.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });
      this.logger.log(`邮件已发送: ${to} - ${subject}`);
      this.logger.debug(`邮件发送结果: ${JSON.stringify(result)}`);
      return true;
    } catch (error) {
      const errMsg = error.message || '未知错误';
      const errCode = error.code || '';
      const errCmd = error.command || '';
      this.logger.error(
        `邮件发送失败: ${to} - code=${errCode} cmd=${errCmd} msg=${errMsg}`,
      );
      throw error; // 往上抛，让 controller 能看到具体原因
    }
  }

  /**
   * 发送验证码邮件（统一模板）
   * @param opts.platformName 平台名（默认 bitlesu）
   * @param opts.tagline 署名寄语
   * @param opts.contact 联系方式
   */
  async sendVerifyCode(
    to: string,
    code: string,
    expireMinutes: number = 10,
    opts?: { platformName?: string; tagline?: string; contact?: string },
  ): Promise<boolean> {
    const platform = opts?.platformName || 'bitlesu';
    const html = renderVerifyCode(code, expireMinutes, opts);
    return this.sendMail(to, `【${platform}】验证码`, html);
  }
}

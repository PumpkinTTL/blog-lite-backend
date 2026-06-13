import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    this.logger.log(`SMTP 配置: host=${host}, port=${port}, user=${user}, pass=${pass ? '***已设置' : '未设置'}`);

    if (!host || !user || !pass) {
      this.logger.warn('SMTP 配置缺失，邮件功能不可用。请配置 SMTP_HOST/SMTP_USER/SMTP_PASS');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: port || 465,
      secure: (port || 465) === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    this.logger.log(`SMTP 已配置: ${host}:${port}`);
  }

  /**
   * 发送邮件
   */
  async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.error('SMTP 未配置，无法发送邮件');
      return false;
    }

    const from = this.configService.get<string>('SMTP_FROM') ||
      `"观书星" <${this.configService.get<string>('SMTP_USER')}>`;

    try {
      const result = await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`邮件已发送: ${to} - ${subject}`);
      this.logger.debug(`邮件发送结果: ${JSON.stringify(result)}`);
      return true;
    } catch (error) {
      const errMsg = error.message || '未知错误';
      const errCode = error.code || '';
      const errCmd = error.command || '';
      this.logger.error(`邮件发送失败: ${to} - code=${errCode} cmd=${errCmd} msg=${errMsg}`);
      throw error; // 往上抛，让 controller 能看到具体原因
    }
  }

  /**
   * 发送验证码邮件
   */
  async sendVerifyCode(to: string, code: string, expireMinutes: number = 10): Promise<boolean> {
    const html = `
      <div style="max-width:480px;margin:0 auto;font-family:system-ui,-apple-system,sans-serif;">
        <div style="padding:32px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111;">密码重置验证码</h2>
          <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">你正在重置观书星账号密码，请使用以下验证码完成操作：</p>
          <div style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px;margin-bottom:24px;">
            <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111;">${code}</span>
          </div>
          <p style="margin:0;color:#9ca3af;font-size:12px;">验证码 ${expireMinutes} 分钟内有效，如非本人操作请忽略此邮件。</p>
        </div>
      </div>
    `;
    return this.sendMail(to, '【观书星】密码重置验证码', html);
  }
}

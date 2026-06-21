import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { renderVerifyCode } from './templates';

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

    this.logger.log(
      `SMTP 配置: host=${host}, port=${port}, user=${user}, pass=${pass ? '***已设置' : '未设置'}`,
    );

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP 配置缺失，邮件功能不可用。请配置 SMTP_HOST/SMTP_USER/SMTP_PASS',
      );
      return;
    }

    // ConfigService 读 env 返回的是字符串，必须转 number，
    // 否则 port='465'（字符串）时 secure 判断 '465'===465 为 false，
    // 导致用明文 STARTTLS 连 465 SSL 端口 → 握手超时。
    const portNum = Number(port) || 465;

    this.transporter = nodemailer.createTransport({
      host,
      port: portNum,
      secure: portNum === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    this.logger.log(`SMTP 已配置: ${host}:${portNum} (secure=${portNum === 465})`);
  }

  /**
   * 发送邮件
   */
  async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.error('SMTP 未配置，无法发送邮件');
      return false;
    }

    const from =
      this.configService.get<string>('SMTP_FROM') ||
      `"观书星" <${this.configService.get<string>('SMTP_USER')}>`;

    try {
      const result = await this.transporter.sendMail({
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

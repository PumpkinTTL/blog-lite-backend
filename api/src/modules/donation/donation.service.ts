import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DonationEntity, DonationStatus } from './donation.entity';
import { DonationNotificationEntity, DonationNotificationType } from './donation-notification.entity';
import { applyFilters } from '../../common/utils/apply-filters';
import { DONATION_STATUS } from '../../common/constants/status';
import { CodeService } from '../code/code.service';
import { MailerService } from '../mailer/mailer.service';
import { renderDonationThanks } from '../mailer/templates';
import { UserService } from '../user/user.service';

@Injectable()
export class DonationService {
  private readonly logger = new Logger(DonationService.name);

  constructor(
    @InjectRepository(DonationEntity)
    private readonly repo: Repository<DonationEntity>,
    @InjectRepository(DonationNotificationEntity)
    private readonly notifRepo: Repository<DonationNotificationEntity>,
    private readonly codeService: CodeService,
    private readonly mailerService: MailerService,
    private readonly userService: UserService,
  ) {}

  async findAll(
    page = 1,
    pageSize = 20,
    filters?: {
      id?: number;
      keyword?: string;
      status?: DonationStatus;
      payMethod?: string;
      cryptoNetwork?: string;
    },
  ) {
    const qb = this.repo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: {
        'e.id': filters?.id,
        'e.status': filters?.status,
        'e.payMethod': filters?.payMethod,
        'e.cryptoNetwork': filters?.cryptoNetwork,
      },
      like: {
        keyword: filters?.keyword,
        fields: ['e.donorName', 'e.message', 'e.tradeNo', 'e.cryptoTxHash'],
      },
    });
    qb.orderBy('e.sortOrder', 'ASC')
      .addOrderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('捐赠记录不存在');
    return entity;
  }

  async create(data: Partial<DonationEntity>) {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: number, data: Partial<DonationEntity>) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('捐赠记录不存在');
    Object.assign(entity, data);
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
  }

  async batchRemove(ids: number[]): Promise<void> {
    await this.repo.delete(ids);
  }

  async toggleStatus(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('捐赠记录不存在');
    entity.status =
      entity.status === DONATION_STATUS.CONFIRMED
        ? DONATION_STATUS.PENDING
        : DONATION_STATUS.CONFIRMED;
    return this.repo.save(entity);
  }

  async toggleVisible(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('捐赠记录不存在');
    entity.isVisible = entity.isVisible === 1 ? 0 : 1;
    return this.repo.save(entity);
  }

  /**
   * 发送感谢（统一入口）
   *
   * 感谢邮件和发码邮件本质相同：都是「给捐赠者发感谢内容」，
   * 区别只是内容里带不带激活码。这里统一成一个方法。
   *
   * - 带 codeId：感谢 + 激活码（码从码池选，关联捐赠并置 disabled，反查邮箱锁归属）
   * - 不带 codeId：纯感谢邮件
   * - 无论是否带码、邮件是否成功，都写入 donation_notifications 记录
   *
   * @param donationId  捐赠记录 ID
   * @param opts.email      收件邮箱（缺省用 donorEmail）
   * @param opts.codeId     可选，带码感谢
   * @param opts.message    可选管理员留言（浅琥珀底块）
   * @param opts.contact    可选联系方式（不传则不显示"如有疑问"段）
   * @param opts.platformName 可选平台名（默认 bitlesu）
   * @param opts.tagline    可选署名寄语（默认"每一篇文章都是生活与阅读的深度思考"）
   * @param opts.sendEmail  是否邮件通知（false 则只记录不发邮件，用于线下转交流程）
   * @param operatorId      操作管理员
   */
  async sendThanks(
    donationId: number,
    opts: {
      email?: string | null;
      codeId?: number | null;
      message?: string;
      contact?: string;
      platformName?: string;
      tagline?: string;
      sendEmail?: boolean;
    },
    operatorId?: number,
  ) {
    const donation = await this.repo.findOne({ where: { id: donationId } });
    if (!donation) throw new NotFoundException('捐赠记录不存在');

    const effectiveEmail = (opts.email || donation.donorEmail || '').trim();

    // —— 处理激活码（若带码）——
    let codeEntity: { id: number; code: string } | null = null;
    let claimedUserId: number | null = null;

    if (opts.codeId) {
      const code = await this.codeService.findById(opts.codeId);
      if (!code) throw new NotFoundException('激活码不存在');
      if (code.type !== 'membership') {
        throw new BadRequestException('只能发放会员激活码');
      }
      if (code.status !== 'active') {
        throw new BadRequestException(`该激活码状态为 ${code.status}，不可发放`);
      }

      // 按邮箱反查系统用户锁归属
      if (effectiveEmail) {
        const sysUser = await this.userService.findByEmail(effectiveEmail);
        if (sysUser) claimedUserId = sysUser.id;
      }

      // 写 metadata（donationId 追溯 + 锁归属）
      const metadata: Record<string, unknown> = {
        ...(code.metadata || {}),
        donationId,
      };
      if (claimedUserId) metadata.claimedUserId = claimedUserId;
      await this.codeService.update(opts.codeId, { metadata });
      // 码置 disabled，移出码池防重复发
      await this.codeService.update(opts.codeId, { status: 'disabled' });
      // 反向回写 donation
      donation.rewardCodeId = code.id;
      await this.repo.save(donation);

      codeEntity = { id: code.id, code: code.code };
      this.logger.log(
        `捐赠 #${donationId} 发放答谢码 ${code.code}${
          claimedUserId ? `（锁定用户#${claimedUserId}）` : '（访客未锁）'
        }`,
      );
    }

    // —— 发送邮件 + 写通知记录 ——
    const hasCode = !!codeEntity;
    const platform = opts.platformName || 'bitlesu';
    const subject = hasCode
      ? `【${platform}】感谢您的捐赠 · 会员激活码`
      : `【${platform}】感谢您的捐赠`;
    let isSent = false;
    let errorMessage: string | null = null;

    if (opts.sendEmail && effectiveEmail) {
      try {
        const html = renderDonationThanks({
          donorName: donation.donorName,
          amount: donation.amount,
          currency: donation.currency,
          message: opts.message,
          code: codeEntity?.code,
          platformName: opts.platformName,
          tagline: opts.tagline,
          contact: opts.contact,
        });
        isSent = await this.mailerService.sendMail(effectiveEmail, subject, html);
      } catch (e) {
        errorMessage = (e as Error).message;
        this.logger.error(`捐赠 #${donationId} 感谢邮件发送失败: ${errorMessage}`);
      }
    }

    const notif = await this.notifRepo.save(
      this.notifRepo.create({
        donationId,
        type: hasCode ? 'code' : 'thanks',
        recipientEmail: effectiveEmail,
        codeId: codeEntity?.id ?? null,
        subject,
        isSent,
        errorMessage,
        operatorId: operatorId ?? null,
      }),
    );

    return {
      code: codeEntity?.code ?? null,
      claimedUserId,
      isSent,
      notif,
    };
  }

  /**
   * 查询某笔捐赠的通知记录历史
   */
  async getNotifications(donationId: number) {
    return this.notifRepo.find({
      where: { donationId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 统计概览 */
  async getStats() {
    // 3 次查询并行：总数、已确认总额+按方式分组、按加密网络分组
    // 注意：status 列是 varchar（'confirmed'/'pending'/'refunded'），必须传字符串值。
    // CASE WHEN 用参数绑定避免 SQL 注入（原代码模板字符串拼接会生成无引号的列名引用）。
    const [totalResult, confirmedMethods, byCrypto] = await Promise.all([
      this.repo
        .createQueryBuilder('e')
        .select('COUNT(*)', 'total')
        .addSelect(
          `SUM(CASE WHEN e.status = :confirmed THEN 1 ELSE 0 END)`,
          'confirmed',
        )
        .addSelect(
          `SUM(CASE WHEN e.status = :pending THEN 1 ELSE 0 END)`,
          'pending',
        )
        .setParameters({
          confirmed: DONATION_STATUS.CONFIRMED,
          pending: DONATION_STATUS.PENDING,
        })
        .getRawOne(),
      this.repo
        .createQueryBuilder('e')
        .select('e.payMethod', 'payMethod')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(e.amount), 0)', 'totalAmount')
        .where('e.status = :status', { status: DONATION_STATUS.CONFIRMED })
        .groupBy('e.payMethod')
        .getRawMany(),
      this.repo
        .createQueryBuilder('e')
        .select('e.cryptoNetwork', 'cryptoNetwork')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(e.amount), 0)', 'totalAmount')
        .where('e.payMethod = :pm AND e.status = :status', {
          pm: 'crypto',
          status: DONATION_STATUS.CONFIRMED,
        })
        .andWhere('e.cryptoNetwork IS NOT NULL')
        .groupBy('e.cryptoNetwork')
        .getRawMany(),
    ]);

    const parse = (v: string) => parseFloat(v || '0');
    const totalAmount = confirmedMethods.reduce(
      (s, r) => s + parse(r.totalAmount),
      0,
    );

    return {
      total: parseInt(totalResult?.total || '0'),
      confirmed: parseInt(totalResult?.confirmed || '0'),
      pending: parseInt(totalResult?.pending || '0'),
      totalAmount,
      byMethod: confirmedMethods.map((r: any) => ({
        payMethod: r.payMethod,
        count: parseInt(r.count),
        totalAmount: parse(r.totalAmount),
      })),
      byCrypto: byCrypto.map((r: any) => ({
        cryptoNetwork: r.cryptoNetwork,
        count: parseInt(r.count),
        totalAmount: parse(r.totalAmount),
      })),
    };
  }

  /** 导出 CSV（仅已确认，最多 10000 条防 OOM） */
  async exportCsv(): Promise<string> {
    const list = await this.repo.find({
      where: { status: DONATION_STATUS.CONFIRMED },
      order: { createdAt: 'DESC' },
      take: 10000,
    });

    const header =
      'ID,捐赠者,金额,币种,支付方式,加密网络,交易哈希,留言,状态,展示,排序,备注,创建时间\n';
    const rows = list.map((d) =>
      [
        d.id,
        `"${(d.donorName || '').replace(/"/g, '""')}"`,
        d.amount,
        d.currency,
        d.payMethod,
        d.cryptoNetwork || '',
        d.cryptoTxHash || '',
        `"${(d.message || '').replace(/"/g, '""')}"`,
        d.status === DONATION_STATUS.CONFIRMED
          ? '已确认'
          : d.status === DONATION_STATUS.PENDING
            ? '待确认'
            : '已退款',
        d.isVisible ? '是' : '否',
        d.sortOrder,
        `"${(d.remark || '').replace(/"/g, '""')}"`,
        d.createdAt.toISOString(),
      ].join(','),
    );

    return header + rows.join('\n');
  }
}

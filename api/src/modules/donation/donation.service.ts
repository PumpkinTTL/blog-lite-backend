import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DonationEntity, DonationStatus } from './donation.entity';
import { applyFilters } from '../../common/utils/apply-filters';
import { DONATION_STATUS } from '../../common/constants/status';

@Injectable()
export class DonationService {
  constructor(
    @InjectRepository(DonationEntity)
    private readonly repo: Repository<DonationEntity>,
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

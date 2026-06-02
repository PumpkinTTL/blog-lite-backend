import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DonationEntity } from './donation.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class DonationService {
  constructor(
    @InjectRepository(DonationEntity)
    private readonly repo: Repository<DonationEntity>,
  ) {}

  async findAll(
    page = 1,
    pageSize = 20,
    filters?: { id?: number; keyword?: string; status?: number; payMethod?: string; cryptoNetwork?: string },
  ) {
    const qb = this.repo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id, 'e.status': filters?.status, 'e.payMethod': filters?.payMethod, 'e.cryptoNetwork': filters?.cryptoNetwork },
      like: { keyword: filters?.keyword, fields: ['e.donorName', 'e.message', 'e.tradeNo', 'e.cryptoTxHash'] },
    });
    qb.orderBy('e.sortOrder', 'ASC').addOrderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    return this.repo.findOne({ where: { id } });
  }

  async create(data: Partial<DonationEntity>) {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: number, data: Partial<DonationEntity>) {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async remove(id: number) {
    await this.repo.delete(id);
  }

  async toggleStatus(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('捐赠记录不存在');
    entity.status = entity.status === 1 ? 0 : 1;
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
    const total = await this.repo.count();
    const confirmed = await this.repo.count({ where: { status: 1 } });
    const pending = await this.repo.count({ where: { status: 0 } });

    // 总金额（仅已确认）
    const amountResult = await this.repo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'totalAmount')
      .where('e.status = :status', { status: 1 })
      .getRawOne();

    // 按支付方式分组统计
    const byMethod = await this.repo
      .createQueryBuilder('e')
      .select('e.payMethod', 'payMethod')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(e.amount), 0)', 'totalAmount')
      .where('e.status = :status', { status: 1 })
      .groupBy('e.payMethod')
      .getRawMany();

    // 按加密货币网络分组
    const byCrypto = await this.repo
      .createQueryBuilder('e')
      .select('e.cryptoNetwork', 'cryptoNetwork')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(e.amount), 0)', 'totalAmount')
      .where('e.payMethod = :pm AND e.status = :status', { pm: 'crypto', status: 1 })
      .andWhere('e.cryptoNetwork IS NOT NULL')
      .groupBy('e.cryptoNetwork')
      .getRawMany();

    return {
      total,
      confirmed,
      pending,
      totalAmount: parseFloat(amountResult?.totalAmount || '0'),
      byMethod: byMethod.map((r: any) => ({
        payMethod: r.payMethod,
        count: parseInt(r.count),
        totalAmount: parseFloat(r.totalAmount),
      })),
      byCrypto: byCrypto.map((r: any) => ({
        cryptoNetwork: r.cryptoNetwork,
        count: parseInt(r.count),
        totalAmount: parseFloat(r.totalAmount),
      })),
    };
  }

  /** 导出 CSV（仅已确认） */
  async exportCsv(): Promise<string> {
    const list = await this.repo.find({
      where: { status: 1 },
      order: { createdAt: 'DESC' },
    });

    const header = 'ID,捐赠者,金额,币种,支付方式,加密网络,交易哈希,留言,状态,展示,排序,备注,创建时间\n';
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
        d.status === 1 ? '已确认' : d.status === 0 ? '待确认' : '已退款',
        d.isVisible ? '是' : '否',
        d.sortOrder,
        `"${(d.remark || '').replace(/"/g, '""')}"`,
        d.createdAt.toISOString(),
      ].join(','),
    );

    return header + rows.join('\n');
  }
}

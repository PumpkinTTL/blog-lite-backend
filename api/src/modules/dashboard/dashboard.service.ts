import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostEntity } from '../post/post.entity';
import { CategoryEntity } from '../category/category.entity';
import { TagEntity } from '../tag/tag.entity';
import { MediaEntity } from '../media/media.entity';
import { UserEntity } from '../user/user.entity';
import { CommentEntity } from '../comment/comment.entity';
import { InteractionEntity } from '../interaction/interaction.entity';
import { DonationEntity } from '../donation/donation.entity';
import { POST_STATUS } from '../../common/constants/status';

/**
 * 仪表盘统计服务
 *
 * 一次 getStats() 并行查询所有指标，返回：
 * - 计数类（卡片）：post/published/draft/category/tag/media/user/pendingComment/like/favorite/totalViews
 * - 内容区块：topPosts（阅读量 TOP5）/ recentUsers（最新注册 5 人）
 * - 图表：postStatusDist（文章状态饼图）/ interactionTrend（7 天互动趋势折线）
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
    @InjectRepository(MediaEntity)
    private readonly mediaRepo: Repository<MediaEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(CommentEntity)
    private readonly commentRepo: Repository<CommentEntity>,
    @InjectRepository(InteractionEntity)
    private readonly interactionRepo: Repository<InteractionEntity>,
    @InjectRepository(DonationEntity)
    private readonly donationRepo: Repository<DonationEntity>,
  ) {}

  async getStats() {
    const [
      postCount,
      publishedCount,
      draftCount,
      categoryCount,
      tagCount,
      mediaCount,
      userCount,
      pendingCommentCount,
      likeCount,
      favoriteCount,
      totalViews,
      topPosts,
      recentUsers,
      postStatusDist,
      interactionTrend,
      donationCount,
      donationTotalAmount,
      donationStatusDist,
      donationPayMethodDist,
      donationTrend,
    ] = await Promise.all([
      this.postRepo.count(),
      this.postRepo.count({ where: { status: POST_STATUS.PUBLISHED } }),
      this.postRepo.count({ where: { status: POST_STATUS.DRAFT } }),
      this.categoryRepo.count(),
      this.tagRepo.count(),
      this.mediaRepo.count(),
      this.userRepo.count(),
      this.commentRepo.count({ where: { status: 'pending' } }),
      this.interactionRepo.count({ where: { type: 'like' } }),
      this.interactionRepo.count({ where: { type: 'favorite' } }),
      this.sumViews(),
      this.getTopPosts(),
      this.getRecentUsers(),
      this.getPostStatusDist(),
      this.getInteractionTrend(),
      this.donationRepo.count({ where: { status: 'confirmed' } }),
      this.getDonationTotalAmount(),
      this.getDonationStatusDist(),
      this.getDonationPayMethodDist(),
      this.getDonationTrend(),
    ]);

    return {
      // 计数类
      postCount,
      publishedCount,
      draftCount,
      categoryCount,
      tagCount,
      mediaCount,
      userCount,
      pendingCommentCount,
      likeCount,
      favoriteCount,
      totalViews,
      // 捐赠
      donationCount,
      donationTotalAmount,
      donationStatusDist,
      donationPayMethodDist,
      donationTrend,
      // 内容区块
      topPosts,
      recentUsers,
      // 图表
      postStatusDist,
      interactionTrend,
    };
  }

  /** 全站总阅读量 */
  private async sumViews(): Promise<number> {
    const row = await this.postRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.viewCount), 0)', 'total')
      .getRawOne<{ total: string }>();
    return Number(row?.total || 0);
  }

  /** 阅读量 TOP5 文章 */
  private async getTopPosts() {
    return this.postRepo.find({
      where: { status: POST_STATUS.PUBLISHED as any },
      select: ['id', 'title', 'slug', 'viewCount', 'likeCount'],
      order: { viewCount: 'DESC' },
      take: 5,
    });
  }

  /** 最新注册 5 个用户 */
  private async getRecentUsers() {
    return this.userRepo.find({
      select: ['id', 'username', 'nickname', 'avatar', 'createdAt'],
      order: { createdAt: 'DESC' },
      take: 5,
    });
  }

  /** 文章状态分布（饼图） */
  private async getPostStatusDist(): Promise<{ name: string; value: number }[]> {
    const rows = await this.postRepo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('p.status')
      .getRawMany<{ status: string; cnt: string }>();
    const labelMap: Record<string, string> = {
      published: '已发布',
      draft: '草稿',
      login: '登录可见',
      private: '私有',
    };
    return rows.map((r) => ({
      name: labelMap[r.status] || r.status,
      value: Number(r.cnt),
    }));
  }

  /** 最近 7 天每日 like / favorite 数（折线图） */
  private async getInteractionTrend(): Promise<
    { date: string; likeCount: number; favoriteCount: number }[]
  > {
    // MySQL: DATE_FORMAT(created_at, '%Y-%m-%d')
    const rows = await this.interactionRepo
      .createQueryBuilder('i')
      .select("DATE_FORMAT(i.createdAt, '%Y-%m-%d')", 'date')
      .addSelect("SUM(CASE WHEN i.type = 'like' THEN 1 ELSE 0 END)", 'likeCount')
      .addSelect("SUM(CASE WHEN i.type = 'favorite' THEN 1 ELSE 0 END)", 'favoriteCount')
      .where('i.createdAt >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)')
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; likeCount: string; favoriteCount: string }>();

    // 补全 7 天连续日期（无数据的日期补 0）
    const map = new Map(rows.map((r) => [r.date, r]));
    const result: { date: string; likeCount: number; favoriteCount: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const row = map.get(key);
      result.push({
        date: key,
        likeCount: Number(row?.likeCount || 0),
        favoriteCount: Number(row?.favoriteCount || 0),
      });
    }
    return result;
  }

  // ===== 捐赠统计 =====

  /** 已确认捐赠总金额（按币种分组，因为多币种不能直接相加） */
  private async getDonationTotalAmount(): Promise<
    { currency: string; amount: number; count: number }[]
  > {
    const rows = await this.donationRepo
      .createQueryBuilder('d')
      .select('d.currency', 'currency')
      .addSelect('COALESCE(SUM(d.amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'count')
      .where('d.status = :s', { s: 'confirmed' })
      .groupBy('d.currency')
      .getRawMany<{ currency: string; amount: string; count: string }>();
    return rows.map((r) => ({
      currency: r.currency,
      amount: Number(r.amount),
      count: Number(r.count),
    }));
  }

  /** 捐赠状态分布（饼图） */
  private async getDonationStatusDist(): Promise<{ name: string; value: number }[]> {
    const rows = await this.donationRepo
      .createQueryBuilder('d')
      .select('d.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('d.status')
      .getRawMany<{ status: string; cnt: string }>();
    const labelMap: Record<string, string> = {
      confirmed: '已确认',
      pending: '待确认',
      refunded: '已退款',
    };
    return rows.map((r) => ({
      name: labelMap[r.status] || r.status,
      value: Number(r.cnt),
    }));
  }

  /** 支付方式分布（饼图） */
  private async getDonationPayMethodDist(): Promise<{ name: string; value: number }[]> {
    const rows = await this.donationRepo
      .createQueryBuilder('d')
      .select('d.payMethod', 'payMethod')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('d.payMethod')
      .getRawMany<{ payMethod: string; cnt: string }>();
    const labelMap: Record<string, string> = {
      wechat: '微信',
      alipay: '支付宝',
      crypto: '加密货币',
      other: '其他',
    };
    return rows.map((r) => ({
      name: labelMap[r.payMethod] || r.payMethod,
      value: Number(r.cnt),
    }));
  }

  /** 最近 7 天每日捐赠笔数 + 金额（按主币种 CNY 折算显示，外币单列） */
  private async getDonationTrend(): Promise<
    { date: string; count: number; amount: number }[]
  > {
    const rows = await this.donationRepo
      .createQueryBuilder('d')
      .select("DATE_FORMAT(d.createdAt, '%Y-%m-%d')", 'date')
      .addSelect('COUNT(*)', 'count')
      .addSelect("COALESCE(SUM(CASE WHEN d.currency = 'CNY' THEN d.amount ELSE 0 END), 0)", 'amount')
      .where('d.status = :s', { s: 'confirmed' })
      .andWhere('d.createdAt >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)')
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; count: string; amount: string }>();

    // 补全 7 天
    const map = new Map(rows.map((r) => [r.date, r]));
    const result: { date: string; count: number; amount: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const row = map.get(key);
      result.push({
        date: key,
        count: Number(row?.count || 0),
        amount: Number(row?.amount || 0),
      });
    }
    return result;
  }
}

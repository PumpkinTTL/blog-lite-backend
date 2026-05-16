import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { CodeEntity, CodeType, CodeStatus } from './code.entity';
import { CodeUsageLogEntity } from './code-usage-log.entity';
import { CreateCodeDto, UpdateCodeDto, VerifyCodeDto, BatchCreateCodeDto, BatchIdsDto } from './code.dto';

@Injectable()
export class CodeService {
  private readonly logger = new Logger(CodeService.name);

  constructor(
    @InjectRepository(CodeEntity)
    private readonly codeRepo: Repository<CodeEntity>,
    @InjectRepository(CodeUsageLogEntity)
    private readonly usageLogRepo: Repository<CodeUsageLogEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 生成邀请码/激活码
   */
  async createCode(dto: CreateCodeDto, creatorId?: number): Promise<CodeEntity> {
    // 生成 AAAA-BBBB-CCCC-DDDD 格式码（4 组各 4 个大写字母）
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const generateSegment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const code = `${generateSegment()}-${generateSegment()}-${generateSegment()}-${generateSegment()}`
    const codeWithPrefix = dto.type === 'invitation' ? `INV-${code}` : code

    // 检查是否已存在
    const existing = await this.codeRepo.findOne({ where: { code: codeWithPrefix } });
    if (existing) {
      throw new ConflictException('码已存在，请重新生成');
    }

    const codeEntity = this.codeRepo.create({
      code: codeWithPrefix,
      type: dto.type,
      status: 'active',
      maxUses: dto.maxUses ?? 1,
      usedCount: 0,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      creatorId,
      metadata: dto.metadata as any,
      discount: dto.type === 'discount' ? (dto.discount as any) : null,
    });

    await this.codeRepo.save(codeEntity);
    this.logger.log(`创建${dto.type}码: ${codeWithPrefix}`);
    return codeEntity;
  }

  /**
   * 验证码是否可用
   */
  async verifyCode(dto: VerifyCodeDto): Promise<{ valid: boolean; code?: CodeEntity; message?: string }> {
    const codeEntity = await this.codeRepo.findOne({ where: { code: dto.code } });

    if (!codeEntity) {
      return { valid: false, message: '码不存在' };
    }

    if (dto.type && codeEntity.type !== dto.type) {
      return { valid: false, message: '码类型不匹配' };
    }

    if (codeEntity.status !== 'active') {
      return { valid: false, message: `码状态为 ${codeEntity.status}，不可使用` };
    }

    if (codeEntity.expiresAt && codeEntity.expiresAt < new Date()) {
      return { valid: false, message: '码已过期' };
    }

    if (codeEntity.maxUses > 0 && codeEntity.usedCount >= codeEntity.maxUses) {
      return { valid: false, message: '码已用完' };
    }

    return { valid: true, code: codeEntity };
  }

  /**
   * 使用码（事务更新 usedCount 和插入使用记录）
   */
  async useCode(
    codeValue: string,
    userId: number | null,
    clientIp: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ success: boolean; message?: string }> {
    return this.dataSource.transaction(async (manager) => {
      const codeEntity = await manager.findOne(CodeEntity, { where: { code: codeValue } });

      if (!codeEntity) {
        throw new NotFoundException('码不存在');
      }

      if (codeEntity.status !== 'active') {
        throw new BadRequestException(`码状态为 ${codeEntity.status}，不可使用`);
      }

      if (codeEntity.expiresAt && codeEntity.expiresAt < new Date()) {
        throw new BadRequestException('码已过期');
      }

      if (codeEntity.maxUses > 0 && codeEntity.usedCount >= codeEntity.maxUses) {
        throw new BadRequestException('码已用完');
      }

      // 插入使用记录
      await manager.insert(CodeUsageLogEntity, {
        codeId: codeEntity.id,
        userId,
        usedAt: new Date(),
        clientIp,
        metadata: metadata as any,
        createdAt: new Date(),
      });

      // 原子更新 usedCount
      const updated = await manager.increment(CodeEntity, { id: codeEntity.id }, 'usedCount', 1);

      // 检查是否用完，更新状态
      if (codeEntity.maxUses > 0 && codeEntity.usedCount + 1 >= codeEntity.maxUses) {
        await manager.update(CodeEntity, { id: codeEntity.id }, {
          status: 'used',
          usedAt: new Date(),
        });
        this.logger.log(`码 ${codeValue} 已用完`);
      } else {
        await manager.update(CodeEntity, { id: codeEntity.id }, {
          usedAt: new Date(),
        });
      }

      this.logger.log(`用户 ${userId} 使用码 ${codeValue}`);
      return { success: true };
    });
  }

  /**
   * 获取码列表
   */
  async findAll(page = 1, pageSize = 20, filters?: { type?: CodeType; status?: CodeStatus; keyword?: string }) {
    const qb = this.codeRepo.createQueryBuilder('c');

    if (filters?.type) qb.andWhere('c.type = :type', { type: filters.type });
    if (filters?.status) qb.andWhere('c.status = :status', { status: filters.status });
    if (filters?.keyword) qb.andWhere('c.code LIKE :keyword', { keyword: `%${filters.keyword}%` });

    qb.orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /**
   * 获取码详情
   */
  async findById(id: number): Promise<CodeEntity> {
    const code = await this.codeRepo.findOne({ where: { id } });
    if (!code) {
      throw new NotFoundException('码不存在');
    }
    return code;
  }

  /**
   * 更新码状态
   */
  async update(id: number, dto: UpdateCodeDto): Promise<CodeEntity> {
    const code = await this.findById(id);

    if (dto.status) code.status = dto.status;
    if (dto.metadata) code.metadata = dto.metadata;
    if (dto.discount !== undefined) code.discount = dto.discount as any;

    return this.codeRepo.save(code);
  }

  /**
   * 删除码
   */
  async remove(id: number): Promise<void> {
    await this.codeRepo.delete(id);
  }

  /**
   * 批量生成码
   */
  async batchCreate(dto: BatchCreateCodeDto, creatorId?: number): Promise<CodeEntity[]> {
    const promises = Array.from({ length: dto.count }, () =>
      this.createCode(
        {
          type: dto.type,
          maxUses: dto.maxUses,
          expiresAt: dto.expiresAt,
          metadata: dto.metadata,
          discount: dto.discount,
        },
        creatorId,
      ),
    );
    return Promise.all(promises);
  }

  /**
   * 批量禁用码
   */
  async batchDisable(ids: number[]): Promise<void> {
    await this.codeRepo.update({ id: In(ids) }, { status: 'disabled' });
  }

  /**
   * 批量删除码
   */
  async batchRemove(ids: number[]): Promise<void> {
    await this.codeRepo.delete(ids);
  }

  /**
   * 获取所有使用日志（分页，支持关联码信息）
   */
  async findAllUsageLogs(page = 1, pageSize = 20, keyword?: string) {
    const qb = this.usageLogRepo.createQueryBuilder('log')
      .leftJoinAndSelect('log.code', 'c')
      .orderBy('log.usedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (keyword) {
      qb.andWhere('c.code LIKE :keyword', { keyword: `%${keyword}%` });
    }

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /**
   * 获取码的使用记录
   */
  async findUsageLogs(codeId: number, page = 1, pageSize = 20) {
    const qb = this.usageLogRepo.createQueryBuilder('log')
      .where('log.codeId = :codeId', { codeId })
      .orderBy('log.usedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }
}
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanEntity } from './plan.entity';
import { CreatePlanDto, UpdatePlanDto } from './plan.dto';

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
  ) {}

  async findAll(onlyActive = false) {
    const qb = this.planRepo.createQueryBuilder('p').orderBy('p.sort', 'ASC').addOrderBy('p.id', 'ASC');
    if (onlyActive) qb.andWhere('p.isActive = :active', { active: true });
    return qb.getMany();
  }

  async findById(id: number): Promise<PlanEntity> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('套餐不存在');
    return plan;
  }

  async findBySlug(slug: string): Promise<PlanEntity | null> {
    return this.planRepo.findOne({ where: { slug } });
  }

  async create(dto: CreatePlanDto): Promise<PlanEntity> {
    // slug 唯一性检查
    const exists = await this.findBySlug(dto.slug);
    if (exists) throw new ConflictException(`slug "${dto.slug}" 已存在`);

    const plan = this.planRepo.create({
      name: dto.name,
      slug: dto.slug,
      level: dto.level,
      durationDays: dto.durationDays,
      priceCents: dto.priceCents ?? 0,
      benefits: dto.benefits ?? null,
      description: dto.description ?? null,
      isActive: dto.isActive ?? true,
      sort: dto.sort ?? 0,
    });
    const saved = await this.planRepo.save(plan);
    this.logger.log(`创建套餐: ${saved.name} (${saved.slug})`);
    return saved;
  }

  async update(id: number, dto: UpdatePlanDto): Promise<PlanEntity> {
    const plan = await this.findById(id);
    Object.assign(plan, dto);
    return this.planRepo.save(plan);
  }

  async remove(id: number): Promise<void> {
    const plan = await this.findById(id);
    // 软性约束：仅允许删除没有关联 membership 的套餐
    // （这里不直接查 membership 表避免循环依赖；由调用方保证）
    await this.planRepo.remove(plan);
    this.logger.log(`删除套餐: ${plan.name} (${plan.slug})`);
  }
}

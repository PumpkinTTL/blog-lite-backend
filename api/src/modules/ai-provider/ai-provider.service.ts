import { Injectable, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { applyFilters } from '../../common/utils/apply-filters';
import { AiProviderEntity } from './ai-provider.entity';
import { AiModelEntity } from '../ai-model/ai-model.entity';
import { CreateAiProviderDto, UpdateAiProviderDto } from './ai-provider.dto';

/** 默认种子配置：9router + 常用模型 */
const SEED_PROVIDER = {
  name: '9router',
  baseUrl: 'https://9router.bitlesu.com/v1',
  apiKey: 'sk-a5192932229f5be4-6wmwyq-13a3121c',
  protocol: 'openai',
  remark: '默认网关（OpenAI 兼容）',
  status: 1,
};
const SEED_MODELS = [
  { modelId: 'cmc/deepseek/deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', supportsThinking: 1, supportsTools: 1 },
  { modelId: 'cmc/deepseek/deepseek-v4-pro', displayName: 'DeepSeek V4 Pro', supportsThinking: 1, supportsTools: 1 },
  { modelId: 'cmc/Qwen/Qwen3.6-Plus', displayName: 'Qwen 3.6 Plus', supportsThinking: 0, supportsTools: 1 },
  { modelId: 'cmc/zai-org/GLM-5', displayName: 'GLM-5', supportsThinking: 0, supportsTools: 1 },
];

@Injectable()
export class AiProviderService implements OnModuleInit {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(
    @InjectRepository(AiProviderEntity)
    private readonly repo: Repository<AiProviderEntity>,
    @InjectRepository(AiModelEntity)
    private readonly modelRepo: Repository<AiModelEntity>,
  ) {}

  /** 启动时若 ai_providers 为空，自动种子 9router + 默认模型 */
  async onModuleInit() {
    const count = await this.repo.count();
    if (count > 0) return;
    this.logger.log('ai_providers 表为空，初始化种子数据（9router）...');
    const provider = this.repo.create(SEED_PROVIDER);
    const saved = await this.repo.save(provider);
    for (const m of SEED_MODELS) {
      await this.modelRepo.save(
        this.modelRepo.create({ ...m, providerId: saved.id, status: 1 }),
      );
    }
    this.logger.log(`种子完成：1 个 provider + ${SEED_MODELS.length} 个模型`);
  }

  async findAll(
    page: number,
    pageSize: number,
    filters?: { id?: number; keyword?: string; status?: number },
  ) {
    const qb = this.repo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id, 'e.status': filters?.status },
      like: { keyword: filters?.keyword, fields: ['e.name'] },
    });
    qb.orderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`AI 提供商 #${id} 不存在`);
    return item;
  }

  async create(data: CreateAiProviderDto) {
    const item = this.repo.create(data);
    return this.repo.save(item);
  }

  async update(id: number, data: UpdateAiProviderDto) {
    const item = await this.findById(id);
    Object.assign(item, data);
    return this.repo.save(item);
  }

  async remove(id: number) {
    const item = await this.findById(id);
    await this.repo.remove(item);
    return item;
  }

  async batchRemove(ids: number[]) {
    const items = await this.repo.findByIds(ids);
    await this.repo.remove(items);
    return items;
  }

  /**
   * 取第一个启用的 provider + 它第一个启用的 model，供 AiService 使用。
   * 兼容层：DB 配置优先，表为空时兜底回退到环境变量（迁移期间不崩）。
   */
  async getActiveConfig(): Promise<{
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
    source: 'db' | 'env';
  }> {
    const provider = await this.repo.findOne({
      where: { status: 1 },
      order: { createdAt: 'ASC' },
    });
    if (provider) {
      const model = await this.modelRepo.findOne({
        where: { providerId: provider.id, status: 1 },
        order: { createdAt: 'ASC' },
      });
      return {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        defaultModel: model?.modelId ?? 'cmc/deepseek/deepseek-v4-flash',
        source: 'db',
      };
    }
    // 兜底：环境变量（迁移过渡期保证不崩）
    return {
      baseUrl: process.env.AI_BASE_URL ?? 'https://9router.bitlesu.com/v1',
      apiKey: process.env.AI_API_KEY ?? '',
      defaultModel: process.env.AI_DEFAULT_MODEL ?? 'cmc/deepseek/deepseek-v4-flash',
      source: 'env',
    };
  }
}

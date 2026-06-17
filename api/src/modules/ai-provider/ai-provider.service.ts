import { Injectable, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { applyFilters } from '../../common/utils/apply-filters';
import { AiProviderEntity, AiProviderModel } from './ai-provider.entity';
import { CreateAiProviderDto, UpdateAiProviderDto } from './ai-provider.dto';

/** 默认种子配置：9router + 常用模型（模型内嵌） */
const SEED: Partial<AiProviderEntity> & { models: AiProviderModel[] } = {
  name: '9router',
  baseUrl: 'https://9router.bitlesu.com/v1',
  apiKey: 'sk-a5192932229f5be4-6wmwyq-13a3121c',
  protocol: 'openai',
  remark: '默认网关（OpenAI 兼容）',
  status: 1,
  models: [
    { modelId: 'cmc/deepseek/deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', supportsThinking: true, supportsTools: true, maxContextTokens: 64000, maxOutputTokens: 8192 },
    { modelId: 'cmc/deepseek/deepseek-v4-pro', displayName: 'DeepSeek V4 Pro', supportsThinking: true, supportsTools: true, maxContextTokens: 64000, maxOutputTokens: 8192 },
    { modelId: 'cmc/Qwen/Qwen3.6-Plus', displayName: 'Qwen 3.6 Plus', supportsThinking: false, supportsTools: true, maxContextTokens: 32000, maxOutputTokens: 8192 },
    { modelId: 'cmc/zai-org/GLM-5', displayName: 'GLM-5', supportsThinking: false, supportsTools: true, maxContextTokens: 32000, maxOutputTokens: 8192 },
  ],
};

@Injectable()
export class AiProviderService implements OnModuleInit {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(
    @InjectRepository(AiProviderEntity)
    private readonly repo: Repository<AiProviderEntity>,
  ) {}

  /** 启动时若 ai_providers 为空，自动种子 9router（含内嵌模型） */
  async onModuleInit() {
    const count = await this.repo.count();
    if (count > 0) return;
    this.logger.log('ai_providers 表为空，初始化种子数据（9router + 内嵌模型）...');
    await this.repo.save(this.repo.create(SEED));
    this.logger.log(`种子完成：9router + ${SEED.models.length} 个模型`);
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

  /** 取所有启用的 provider（含 models），供写作面板联动选择 */
  async findActive(): Promise<AiProviderEntity[]> {
    return this.repo.find({
      where: { status: 1 },
      order: { createdAt: 'ASC' },
    });
  }

  async findById(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`AI 提供商 #${id} 不存在`);
    return item;
  }

  async create(data: CreateAiProviderDto) {
    const item = this.repo.create({
      ...data,
      models: data.models ?? [],
    });
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
   * 取第一个启用的 provider + 它第一个 model，供 AiService 使用。
   * 兼容层：DB 配置优先，表为空时兜底回退到环境变量。
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
      const firstModel = provider.models?.[0];
      return {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        defaultModel: firstModel?.modelId ?? 'cmc/deepseek/deepseek-v4-flash',
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

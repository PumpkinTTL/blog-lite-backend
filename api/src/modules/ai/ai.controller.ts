import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiGenerateDto } from './ai.dto';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * AI 能力接口（仅 admin 可调用）。
 * 通过 AiModule 局部注册，鉴权走全局 AuthGuard + RolesGuard。
 */
@Controller('ai')
@Roles('admin')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * 统一生成接口：根据文章标题+正文，生成勾选的内容（副标题/摘要/slug）。
   * POST /ai/generate
   */
  @Post('generate')
  async generate(@Body() dto: AiGenerateDto) {
    if (!dto.title && !dto.content) {
      throw new BadRequestException('标题和正文不能同时为空');
    }
    if (!dto.fields || dto.fields.length === 0) {
      throw new BadRequestException('请至少选择一项要生成的内容');
    }
    const data = await this.aiService.generate(
      dto.title ?? '',
      dto.content ?? '',
      dto.fields,
      dto.model,
    );
    return { success: true, data, message: 'AI 生成完成' };
  }
}

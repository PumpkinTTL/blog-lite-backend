import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { AiConversationService } from './ai-conversation.service';
import { SaveConversationDto, BatchIdsDto } from './ai-conversation.dto';
import { parsePagination } from '../../common/utils/parse-pagination';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('ai-conversations')
@Roles('admin')
export class AiConversationController {
  constructor(private readonly service: AiConversationService) {}

  /** entity → 详情 DTO（messages / compactionMessages 都 parse 成数组，前端直接用） */
  private toDetail(item: any) {
    let compactionMessages: unknown[] | null = null;
    if (item.compactionMessages) {
      try {
        const arr = JSON.parse(item.compactionMessages);
        if (Array.isArray(arr)) compactionMessages = arr;
      } catch {
        compactionMessages = null;
      }
    }
    return {
      id: item.id,
      postId: item.postId,
      model: item.model,
      promptTokens: item.promptTokens ?? 0,
      completionTokens: item.completionTokens ?? 0,
      rounds: item.rounds ?? 0,
      compactionSummary: item.compactionSummary ?? null,
      compactionMessages,
      compactionTokens: item.compactionTokens ?? 0,
      compactedAt: item.compactedAt ?? null,
      hasCompaction: item.compactionSummary != null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      messages: JSON.parse(item.messages),
    };
  }

  /** 管理页分页列表 */
  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
    @Query('postId') postId?: string,
  ) {
    const { page: p, pageSize: ps } = parsePagination({ page, pageSize });
    const data = await this.service.findAll(p, ps, {
      id: id ? Number(id) : undefined,
      postId: postId ? Number(postId) : undefined,
    });
    return { success: true, data, message: '查询成功' };
  }

  /** 按主键读取单条（管理页详情查看用，messages 已 parse） */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const item = await this.service.findById(id);
    return { success: true, data: this.toDetail(item), message: '查询成功' };
  }

  /** 按文章 ID 读取对话（AgentPanel 加载用） */
  @Get('post/:postId')
  async findByPostId(@Param('postId', ParseIntPipe) postId: number) {
    const item = await this.service.findByPostId(postId);
    const data = item ? this.toDetail(item) : null;
    return { success: true, data, message: item ? '查询成功' : '无对话历史' };
  }

  /** 保存/更新（AgentPanel 每轮结束后调用） */
  @Post('save')
  async save(@Body() dto: SaveConversationDto) {
    const data = await this.service.save(dto);
    return { success: true, data, message: '已保存' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.remove(id);
    return { success: true, data, message: '删除成功' };
  }

  @Delete('post/:postId')
  async removeByPostId(@Param('postId', ParseIntPipe) postId: number) {
    const data = await this.service.removeByPostId(postId);
    return { success: true, data, message: '已清空该文章对话' };
  }

  @Delete('batch')
  async batchRemove(@Body() dto: BatchIdsDto) {
    const data = await this.service.batchRemove(dto.ids);
    return { success: true, data, message: '批量删除成功' };
  }
}

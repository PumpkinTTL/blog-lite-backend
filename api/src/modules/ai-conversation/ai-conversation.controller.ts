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
    const data = {
      id: item.id,
      postId: item.postId,
      model: item.model,
      promptTokens: item.promptTokens ?? 0,
      completionTokens: item.completionTokens ?? 0,
      rounds: item.rounds ?? 0,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      messages: JSON.parse(item.messages),
    };
    return { success: true, data, message: '查询成功' };
  }

  /** 按文章 ID 读取对话（AgentPanel 加载用） */
  @Get('post/:postId')
  async findByPostId(@Param('postId', ParseIntPipe) postId: number) {
    const item = await this.service.findByPostId(postId);
    // messages 是 JSON 字符串，解析后返回；一并返回 token 累计与轮次（前端恢复统计）
    const data = item
      ? {
          id: item.id,
          postId: item.postId,
          model: item.model,
          promptTokens: item.promptTokens ?? 0,
          completionTokens: item.completionTokens ?? 0,
          rounds: item.rounds ?? 0,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          messages: JSON.parse(item.messages),
        }
      : null;
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

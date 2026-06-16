import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostService } from './post.service';
import { PostEntity } from './post.entity';
import { CreatePostDto, UpdatePostDto, BatchIdsDto } from './post.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';
import { POST_STATUS } from '../../common/constants/status';
import { InteractionService } from '../interaction/interaction.service';

@Controller('post')
@Roles('admin')
export class PostController {
  constructor(
    private readonly postService: PostService,
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    private readonly interactionService: InteractionService,
  ) {}

  @Public()
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Query('categoryId') categoryId?: string,
    @Query('tagId') tagId?: string,
    @Req() req?: Request,
  ) {
    // 已登录管理员看全部；登录用户看 published+login；未登录只看 published
    const user = (req as any)?.user;
    const isAdmin = user?.roles?.includes('admin') ?? false;
    const isLoggedIn = !!user && !isAdmin;
    const data = await this.postService.findAll(
      parsePage(page),
      parsePageSize(pageSize),
      {
        id: id !== undefined ? parseInt(id) : undefined,
        keyword,
        status: status !== undefined ? status : undefined,
        categoryId: categoryId !== undefined ? parseInt(categoryId) : undefined,
        tagId: tagId !== undefined ? parseInt(tagId) : undefined,
      },
      !isAdmin,
      isAdmin, // withVisibility：admin 列表带可见性配置
      isLoggedIn, // 登录用户额外可见 login 状态文章
    );
    return { success: true, data, message: 'ok' };
  }

  @Get('trashed')
  async trashed(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.postService.findTrashed(
      parsePage(page),
      parsePageSize(pageSize),
    );
    return { success: true, data, message: 'ok' };
  }

  @Public()
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = (req as any)?.user;
    const isAdmin = user?.roles?.includes('admin') ?? false;
    const userId = user?.sub ? Number(user.sub) : null;
    // AuthGuard 已挂载 user.roles（数组），用于角色授权校验
    const userRoleIds: number[] = user?.roleIds ?? [];

    // admin 看全部，登录用户看 published+login，未登录只看 published
    const publicOnly = !isAdmin && userId === null;
    const post = await this.postService.findById(id, publicOnly);
    if (!post) {
      return { success: false, message: '文章不存在', data: null };
    }

    // login 文章：匿名用户不可见（findById publicOnly 已过滤，此处防御）
    if (post.status === POST_STATUS.LOGIN && userId === null) {
      return { success: false, message: '无权访问', data: null };
    }

    // draft 文章：非 admin 不可见
    if (post.status === POST_STATUS.DRAFT && !isAdmin) {
      return { success: false, message: '文章不存在', data: null };
    }

    // private 文章：非 admin 用户必须被授权（直接授权 OR 角色命中）
    if (post.status === POST_STATUS.PRIVATE && !isAdmin) {
      if (userId === null) {
        return { success: false, message: '无权访问', data: null };
      }
      const allowed = await this.postService.canAccess(id, userId, userRoleIds);
      if (!allowed) {
        return { success: false, message: '无权访问', data: null };
      }
    }

    // admin 看详情时附带可见性配置
    let visibility:
      | { allowedUserIds: number[]; allowedRoleIds: number[] }
      | undefined;
    if (isAdmin) {
      visibility = await this.postService.getVisibility(id);
    }

    return {
      success: true,
      data: {
        ...post,
        ...(visibility
          ? {
              allowedUserIds: visibility.allowedUserIds,
              allowedRoleIds: visibility.allowedRoleIds,
            }
          : {}),
      },
      message: 'ok',
    };
  }

  @Public()
  @Post(':id/view')
  async recordView(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const ip =
      req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const ua = req.headers['user-agent'] || '';
    await this.postService.recordView(id, ip, ua);
    return { success: true, message: 'ok' };
  }

  @Post('batch/publish')
  async batchPublish(@Body() body: BatchIdsDto) {
    await this.postService.batchUpdateStatus(body.ids, POST_STATUS.PUBLISHED);
    return { success: true, message: '批量发布成功' };
  }

  @Post('batch/unpublish')
  async batchUnpublish(@Body() body: BatchIdsDto) {
    await this.postService.batchUpdateStatus(body.ids, POST_STATUS.DRAFT);
    return { success: true, message: '批量下架成功' };
  }

  @Post('batch/delete')
  async batchDelete(@Body() body: BatchIdsDto) {
    await this.postService.batchDelete(body.ids);
    return { success: true, message: '批量删除成功' };
  }

  @Post('batch/force-delete')
  async batchForceDelete(@Body() body: BatchIdsDto) {
    await this.postService.batchForceDelete(body.ids);
    return { success: true, message: '彻底删除成功' };
  }

  @Post()
  async create(@Body() dto: CreatePostDto, @Req() req: Request) {
    const payload = req as unknown as { user?: { sub?: string } };
    const authorId = parseInt(payload.user?.sub ?? '1', 10);
    const data = await this.postService.create({ ...dto, authorId });
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id/restore')
  async restore(@Param('id', ParseIntPipe) id: number) {
    await this.postService.restore(id);
    return { success: true, message: '恢复成功' };
  }

  @Put(':id/toggle-pin')
  async togglePin(@Param('id', ParseIntPipe) id: number) {
    const data = await this.postService.togglePin(id);
    return { success: true, data, message: data ? '操作成功' : '文章不存在' };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostDto,
  ) {
    const data = await this.postService.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.postService.remove(id);
    return { success: true, message: '删除成功' };
  }

  // ===== 用户端：点赞/收藏（登录即可，方法级 @Roles() 空数组覆盖类级 admin 限制）=====

  /**
   * 切换当前用户对文章的点赞/收藏
   * 同步更新 posts.like_count / favorite_count 冗余字段
   */
  @Roles() // 空角色覆盖类级 @Roles('admin')，允许任意登录用户
  @Post(':id/interact')
  async toggleInteract(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { type: 'like' | 'favorite' },
    @Req() req: Request,
  ) {
    const userId = Number((req as any)?.user?.sub);
    if (!userId) {
      return { success: false, message: '请先登录', data: null };
    }
    const type = body?.type;
    if (type !== 'like' && type !== 'favorite') {
      return {
        success: false,
        message: 'type 只能是 like 或 favorite',
        data: null,
      };
    }
    const result = await this.interactionService.toggle(
      userId,
      'post',
      id,
      type,
    );
    // 同步冗余计数（避免每次列表查询都 GROUP BY interactions）
    const count = await this.interactionService.countOne('post', id, type);
    await this.postRepo.update(id, {
      ...(type === 'like' ? { likeCount: count } : {}),
      ...(type === 'favorite' ? { favoriteCount: count } : {}),
    });
    return {
      success: true,
      data: result,
      message: result.active ? '已操作' : '已取消',
    };
  }
}

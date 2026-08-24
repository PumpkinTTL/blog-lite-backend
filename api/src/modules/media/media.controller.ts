import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { MediaService } from './media.service';
import {
  CreateMediaDto,
  UpdateMediaDto,
  BatchIdsDto,
  UploadStorageDto,
  PresignR2Dto,
  TestR2Dto,
  ConfirmR2Dto,
} from './media.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';
import type { Request } from 'express';

/**
 * 文件上传过滤器：同时校验扩展名 + MIME 类型（防 shell.php.jpg 等伪装）。
 * 扩展名白名单保持与 R2 直传路径一致，MIME 白名单校验 base type。
 */
const ALLOWED_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|mp3|pdf|doc|docx|xls|xlsx|zip|rar)$/;
const ALLOWED_MIME_BASE = ['image', 'video', 'audio', 'application', 'text'];
function uploadFileFilter(_req: any, file: Express.Multer.File, cb: any) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.test(ext)) {
    cb(new BadRequestException('不支持的文件类型'), false);
    return;
  }
  // MIME 校验：取主类型（image/jpeg → image），防止扩展名白名单但实际是脚本
  const mimeBase = (file.mimetype || '').split('/')[0];
  if (!ALLOWED_MIME_BASE.includes(mimeBase)) {
    cb(new BadRequestException('文件 MIME 类型不被允许'), false);
    return;
  }
  cb(null, true);
}

@Controller('media')
@Roles('admin')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Query('mimeType') mimeType?: string,
  ) {
    const data = await this.mediaService.findAll(
      parsePage(page),
      parsePageSize(pageSize),
      {
        id: id !== undefined ? parseInt(id) : undefined,
        keyword,
        mimeType,
      },
    );
    return { success: true, data, message: 'ok' };
  }

  @Post('upload-many')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: uploadFileFilter,
    }),
  )
  async uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
    @Body() dto: UploadStorageDto,
  ) {
    if (!files?.length) {
      throw new BadRequestException('请选择文件');
    }
    const payload = req as { user?: { sub?: string } };
    const uploaderId = parseInt(payload.user?.sub ?? '1', 10);
    const data = await this.mediaService.uploadMany(files, uploaderId, {
      storageType: dto.storageType,
      ossPlatform: dto.ossPlatform,
      note: dto.note,
      app: dto.app,
      folder: dto.folder,
    });
    return { success: true, data, message: '上传成功' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.mediaService.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: uploadFileFilter,
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Body() dto: UploadStorageDto,
  ) {
    if (!file) {
      throw new BadRequestException('请选择文件');
    }
    const payload = req as { user?: { sub?: string } };
    const uploaderId = parseInt(payload.user?.sub ?? '1', 10);
    const data = await this.mediaService.upload(file, uploaderId, {
      storageType: dto.storageType,
      ossPlatform: dto.ossPlatform,
      note: dto.note,
      app: dto.app,
      folder: dto.folder,
    });
    return { success: true, data, message: '上传成功' };
  }

  /**
   * 测试 R2 账号连通性（系统设置面板「测试连通性」按钮）
   * 用表单当前值直接验证 endpoint/凭证/桶，无需先保存。
   */
  @Post('test-r2')
  async testR2(@Body() dto: TestR2Dto) {
    const result = await this.mediaService.testR2Connection(dto);
    return { success: true, data: result, message: 'ok' };
  }

  /**
   * 申请 R2 presigned PUT URL（前端直传模式）
   *
   * 前端选好文件后调用：
   * - 命中秒传 → 返回 { alreadyExists: true, media }
   * - 未命中   → 返回 { alreadyExists: false, uploadUrl, key, publicUrl }
   *
   * 前端拿到 uploadUrl 后用 XHR 直接 PUT 到 R2，绕过后端中转。
   */
  @Post('presign')
  async presign(@Body() dto: PresignR2Dto) {
    if (dto.size > 10 * 1024 * 1024) {
      throw new BadRequestException('文件大小超过 10MB 限制');
    }
    const data = await this.mediaService.presignR2Upload({
      filename: dto.filename,
      contentType: dto.contentType,
      size: dto.size,
      hash: dto.hash,
      app: dto.app,
      folder: dto.folder,
      note: dto.note,
    });
    return { success: true, data, message: 'ok' };
  }

  /**
   * 直传完成后的入库确认
   *
   * 前端 PUT 到 R2 成功后回调，后端 HEAD 校验对象存在 + 大小一致后写 media 记录。
   * 幂等：同 hash 重复 confirm 直接返回已有记录。
   */
  @Post('confirm')
  async confirm(@Body() dto: ConfirmR2Dto, @Req() req: Request) {
    const payload = req as { user?: { sub?: string } };
    const uploaderId = parseInt(payload.user?.sub ?? '1', 10);
    const data = await this.mediaService.confirmR2Upload({
      key: dto.key,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      size: dto.size,
      hash: dto.hash,
      app: dto.app,
      folder: dto.folder,
      note: dto.note,
      uploaderId,
    });
    return { success: true, data, message: '上传成功' };
  }

  @Post()
  async create(@Body() dto: CreateMediaDto) {
    const data = await this.mediaService.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMediaDto,
  ) {
    const data = await this.mediaService.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Delete('batch')
  async batchRemove(@Body() dto: BatchIdsDto) {
    await this.mediaService.batchRemove(dto.ids);
    return { success: true, message: '批量删除成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.mediaService.remove(id);
    return { success: true, message: '删除成功' };
  }
}

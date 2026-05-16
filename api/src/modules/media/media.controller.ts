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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { MediaService } from './media.service';
import { CreateMediaDto, UpdateMediaDto, BatchIdsDto } from './media.dto';
import type { Request } from 'express';

@Controller('media')
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
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100),
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
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|mp3|pdf|doc|docx|xls|xlsx|zip|rar)$/;
        if (!allowed.test(extname(file.originalname).toLowerCase())) {
          cb(new BadRequestException('不支持的文件类型'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadMany(@UploadedFiles() files: Express.Multer.File[], @Req() req: Request) {
    if (!files?.length) {
      throw new BadRequestException('请选择文件');
    }
    const payload = req as { user?: { sub?: string } };
    const uploaderId = parseInt(payload.user?.sub ?? '1', 10);
    const data = await this.mediaService.uploadMany(files, uploaderId);
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
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|mp3|pdf|doc|docx|xls|xlsx|zip|rar)$/;
        if (!allowed.test(extname(file.originalname).toLowerCase())) {
          cb(new BadRequestException('不支持的文件类型'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) {
      throw new BadRequestException('请选择文件');
    }
    const payload = req as { user?: { sub?: string } };
    const uploaderId = parseInt(payload.user?.sub ?? '1', 10);
    const data = await this.mediaService.upload(file, uploaderId);
    return { success: true, data, message: '上传成功' };
  }

  @Post()
  async create(@Body() dto: CreateMediaDto) {
    const data = await this.mediaService.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMediaDto) {
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

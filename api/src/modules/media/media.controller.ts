import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { MediaService } from './media.service';
import { CreateMediaDto } from './media.dto';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
  ) {
    const data = await this.mediaService.findAll(
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100),
      {
        id: id !== undefined ? parseInt(id) : undefined,
        keyword,
      },
    );
    return { success: true, data, message: 'ok' };
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
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请选择文件');
    }
    const data = await this.mediaService.upload(file);
    return { success: true, data, message: '上传成功' };
  }

  @Post()
  async create(@Body() dto: CreateMediaDto) {
    const data = await this.mediaService.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.mediaService.remove(id);
    return { success: true, message: '删除成功' };
  }
}

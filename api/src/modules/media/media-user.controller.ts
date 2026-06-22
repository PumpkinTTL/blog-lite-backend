import {
  Controller,
  Post,
  Body,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { MediaService } from './media.service';
import { PresignR2Dto, ConfirmR2Dto } from './media.dto';

/**
 * 前台用户媒体上传 Controller（登录即可用，不需要 admin 角色）
 *
 * 与 MediaController（@Roles('admin')）的区别：
 * - 本 Controller 不加 @Roles，仅靠全局 JwtAuthGuard 验证登录态
 * - 限制 app/folder 白名单（avatar/cover/post），防止普通用户任意指定路径
 * - 复用 MediaService 的 presignR2Upload / confirmR2Upload 逻辑
 *
 * 路径前缀 /media/user，避免与 admin 的 /media/presign、/media/confirm 冲突。
 */
@Controller('media/user')
export class MediaUserController {
  /** 允许普通用户使用的 app 值（白名单） */
  private static readonly ALLOWED_APPS = new Set(['vibehub', 'blog']);
  /** 允许普通用户使用的 folder 值（白名单） */
  private static readonly ALLOWED_FOLDERS = new Set([
    'avatar',
    'cover',
    'post',
    'article',
  ]);

  constructor(private readonly mediaService: MediaService) {}

  /** 校验 app/folder 白名单，非法值返回 BadRequest */
  private validateScope(app?: string, folder?: string): void {
    if (app && !MediaUserController.ALLOWED_APPS.has(app)) {
      throw new BadRequestException(`不允许的 app 值: ${app}`);
    }
    if (folder && !MediaUserController.ALLOWED_FOLDERS.has(folder)) {
      throw new BadRequestException(`不允许的 folder 值: ${folder}`);
    }
  }

  /**
   * 申请 R2 presigned PUT URL（前台用户直传）
   * 命中秒传 → { alreadyExists: true, media }
   * 未命中   → { alreadyExists: false, uploadUrl, key, publicUrl }
   */
  @Post('presign')
  async presign(@Body() dto: PresignR2Dto) {
    if (dto.size > 10 * 1024 * 1024) {
      throw new BadRequestException('文件大小超过 10MB 限制');
    }
    this.validateScope(dto.app, dto.folder);
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
   * 直传完成后的入库确认（前台用户）
   * HEAD 校验对象存在 + 大小一致后写 media 记录，幂等。
   */
  @Post('confirm')
  async confirm(@Body() dto: ConfirmR2Dto, @Req() req: Request) {
    this.validateScope(dto.app, dto.folder);
    const payload = req as { user?: { sub?: string } };
    const uploaderId = parseInt(payload.user?.sub ?? '0', 10);
    if (!uploaderId) {
      throw new BadRequestException('无法识别用户身份');
    }
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
}

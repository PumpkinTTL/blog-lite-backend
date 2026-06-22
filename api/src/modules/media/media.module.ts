import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaEntity } from './media.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { MediaUserController } from './media-user.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MediaEntity])],
  controllers: [MediaController, MediaUserController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaEntity } from './entities/media.entity';
import { MediaService } from './services/media.service';
import { MediaController } from './controllers/media.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MediaEntity])],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}

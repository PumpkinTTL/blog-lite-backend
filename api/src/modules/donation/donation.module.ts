import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonationEntity } from './donation.entity';
import { DonationService } from './donation.service';
import { DonationController } from './donation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DonationEntity])],
  controllers: [DonationController],
  providers: [DonationService],
  exports: [DonationService],
})
export class DonationModule {}

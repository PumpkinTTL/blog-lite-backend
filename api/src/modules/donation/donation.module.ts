import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonationEntity } from './donation.entity';
import { DonationNotificationEntity } from './donation-notification.entity';
import { DonationService } from './donation.service';
import { DonationController } from './donation.controller';
import { CodeModule } from '../code/code.module';
import { MailerModule } from '../mailer/mailer.module';
import { UserModule } from '../user/user.module';

@Module({
  // CodeModule 发激活码；MailerModule 发邮件；UserModule 按邮箱反查系统用户锁归属
  imports: [
    TypeOrmModule.forFeature([DonationEntity, DonationNotificationEntity]),
    CodeModule,
    MailerModule,
    UserModule,
  ],
  controllers: [DonationController],
  providers: [DonationService],
  exports: [DonationService],
})
export class DonationModule {}

import { Module } from '@nestjs/common';
import { EmailCodeService } from './email-code.service';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [MailerModule],
  providers: [EmailCodeService],
  exports: [EmailCodeService],
})
export class EmailCodeModule {}

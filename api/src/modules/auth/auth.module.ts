import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './services/auth.service';
import { AuthGuard } from './guards/auth.guard';

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
    }),
  ],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}

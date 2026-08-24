import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { CasdoorService } from './casdoor.service';

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
    }),
  ],
  providers: [AuthService, CasdoorService, AuthGuard, RolesGuard],
  exports: [AuthService, CasdoorService, AuthGuard, RolesGuard],
})
export class AuthModule {}

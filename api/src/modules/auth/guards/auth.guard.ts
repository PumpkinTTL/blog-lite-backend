import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少 Authorization 头');
    }

    const token = authHeader.slice(7);

    try {
      const payload = await this.authService.verifyToken(token);
      request.user = payload;
      return true;
    } catch (error) {
      this.logger.warn(`Token 验证失败: ${(error as Error).message}`);
      throw new UnauthorizedException('Token 无效或已过期');
    }
  }
}

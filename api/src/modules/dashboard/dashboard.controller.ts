import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('dashboard')
@Roles('admin')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async stats() {
    const data = await this.dashboardService.getStats();
    return { success: true, data, message: 'ok' };
  }
}

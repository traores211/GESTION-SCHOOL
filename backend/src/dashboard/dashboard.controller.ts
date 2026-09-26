import { RequirePermissions } from '../authz/decorators';
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@ApiTags('Dashboard')
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @RequirePermissions('dashboard:read')
  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.dashboardService.overview(user);
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Controller('dashboard')
@ApiTags('Dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.dashboardService.overview(user);
  }

  @Get('filters')
  filters(@CurrentUser() user: AuthUser) {
    return this.dashboardService.filters(user);
  }

  @Get('analytics')
  analytics(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto) {
    return this.dashboardService.analytics(user, query);
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ALL_STAFF } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { RedisService } from '../infra/redis.service';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

/** Dashboard figures aggregate thousands of rows: cached per school, role and filters for one minute. */
const TTL_SECONDS = Number(process.env.DASHBOARD_CACHE_SECONDS || 60);

@Controller('dashboard')
@ApiTags('Dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_STAFF)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly cache: RedisService,
  ) {}

  private key(user: AuthUser, name: string, extra: object = {}) {
    return `dashboard:${user.schoolId}:${user.role}:${name}:${JSON.stringify(extra)}`;
  }

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.cache.remember(this.key(user, 'overview'), TTL_SECONDS, () => this.dashboardService.overview(user));
  }

  @Get('filters')
  filters(@CurrentUser() user: AuthUser) {
    return this.cache.remember(this.key(user, 'filters'), TTL_SECONDS, () => this.dashboardService.filters(user));
  }

  @Get('analytics')
  analytics(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto) {
    return this.cache.remember(this.key(user, 'analytics', query), TTL_SECONDS, () => this.dashboardService.analytics(user, query));
  }
}

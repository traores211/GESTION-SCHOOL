import { Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { FINANCE, MANAGEMENT } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { InsightsService } from './insights.service';

/** Decision aids for the head of the school: weekly summary and collection forecast. */
@Controller('insights')
@ApiTags('Insights')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...MANAGEMENT)
@ApiBearerAuth()
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('weekly')
  weekly(@CurrentUser() user: AuthUser, @Query('week') week?: string) {
    return this.insights.weekly(user, week === 'previous');
  }

  @Post('weekly/send')
  @HttpCode(200)
  send(@CurrentUser() user: AuthUser) {
    return this.insights.sendToMe(user);
  }

  @Get('forecast')
  @Roles(...FINANCE)
  forecast(@CurrentUser() user: AuthUser) {
    return this.insights.forecast(user);
  }
}

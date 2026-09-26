import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../authz/decorators';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { UpdateSchoolSettingsDto } from './dto';
import { SchoolSettingsService } from './school-settings.service';

@Controller('school')
@ApiTags('School settings')
@ApiBearerAuth()
export class SchoolSettingsController {
  constructor(private readonly service: SchoolSettingsService) {}

  @RequirePermissions('school:settings')
  @Get('settings')
  get(@CurrentUser() user: AuthUser) {
    return this.service.get(user);
  }

  @RequirePermissions('school:settings')
  @Patch('settings')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSchoolSettingsDto) {
    return this.service.update(user, dto);
  }

  @RequirePermissions('audit:read')
  @Get('audit-logs')
  auditLogs(@CurrentUser() user: AuthUser, @Query('resource') resource?: string) {
    return this.service.auditLogs(user, resource);
  }

  @RequirePermissions('school:settings')
  @Get('outbox')
  outbox(@CurrentUser() user: AuthUser) {
    return this.service.outbox(user);
  }

  @RequirePermissions('school:settings')
  @Get('contact-messages')
  contactMessages(@CurrentUser() user: AuthUser) {
    return this.service.contactMessages(user);
  }

  @RequirePermissions('school:settings')
  @Patch('contact-messages/:id/handled')
  handled(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markContactHandled(user, id);
  }
}

import { Authenticated } from '../authz/decorators';
import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@ApiTags('Notifications')
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Authenticated()
  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.notificationsService.findForUser(user, unread === 'true');
  }

  @Authenticated()
  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.unreadCount(user);
  }

  @Authenticated()
  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user, id);
  }

  @Authenticated()
  @Patch('mark-all-read')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllRead(user);
  }
}

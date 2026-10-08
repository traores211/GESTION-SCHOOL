import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
import { PushService } from './push.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { NotificationsService } from './notifications.service';

class PreferencesDto {
  /** Categories the account does not want: GATE, GRADES, DOCUMENTS, ATTENDANCE */
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  muted!: string[];
}

class PushDeviceDto {
  /** Address given by the browser when it subscribes to push notifications */
  @IsString()
  @MaxLength(2000)
  endpoint!: string;
}

@Controller('notifications')
@ApiTags('Notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly push: PushService,
  ) {}

  /** Whether push notifications are configured, and the public key the browser subscribes with. */
  @Get('push')
  pushConfig() {
    return this.push.config();
  }

  @Post('push/devices')
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: PushDeviceDto) {
    return this.push.subscribe(user, dto.endpoint);
  }

  @Delete('push/devices')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: PushDeviceDto) {
    return this.push.unsubscribe(user, dto.endpoint);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.notificationsService.findForUser(user, unread === 'true');
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthUser) {
    return this.notificationsService.preferences(user);
  }

  @Put('preferences')
  setPreferences(@CurrentUser() user: AuthUser, @Body() dto: PreferencesDto) {
    return this.notificationsService.setPreferences(user, dto.muted);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.unreadCount(user);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user, id);
  }

  @Patch('mark-all-read')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllRead(user);
  }
}

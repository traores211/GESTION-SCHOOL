import { RequirePermissions } from '../authz/decorators';
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Controller('announcements')
@ApiTags('Announcements')
@ApiBearerAuth()
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @RequirePermissions('announcements:write')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.announcementsService.create(user, dto);
  }

  @RequirePermissions('announcements:read')
  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.announcementsService.findAll(user);
  }

  @RequirePermissions('announcements:write')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<CreateAnnouncementDto>) {
    return this.announcementsService.update(user, id, dto);
  }

  @RequirePermissions('announcements:write')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcementsService.remove(user, id);
  }
}

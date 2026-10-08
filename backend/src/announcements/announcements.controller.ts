import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ALL_STAFF, MANAGEMENT } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PageQueryDto } from '../common/pagination';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

/** Validated partial update (a bare Partial<> type would skip validation). */
class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}

@Controller('announcements')
@ApiTags('Announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...MANAGEMENT)
@ApiBearerAuth()
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.announcementsService.create(user, dto);
  }

  @Roles(...ALL_STAFF)
  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() page: PageQueryDto) {
    return this.announcementsService.findAll(user, page);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcementsService.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcementsService.remove(user, id);
  }
}

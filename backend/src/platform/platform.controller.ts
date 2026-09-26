import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../authz/decorators';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateSchoolDto, UpdateSchoolDto } from './platform.dto';
import { PlatformService } from './platform.service';

/** SaaS operator console. platform:manage is held only by PLATFORM_ADMIN (no school data access). */
@Controller('platform')
@ApiTags('Platform')
@ApiBearerAuth()
@RequirePermissions('platform:manage')
export class PlatformController {
  constructor(private readonly service: PlatformService) {}

  @Get('catalogue')
  catalogue() {
    return this.service.catalogue();
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('schools')
  schools() {
    return this.service.listSchools();
  }

  @Post('schools')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSchoolDto) {
    return this.service.createSchool(user, dto);
  }

  @Patch('schools/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSchoolDto) {
    return this.service.updateSchool(user, id, dto);
  }
}

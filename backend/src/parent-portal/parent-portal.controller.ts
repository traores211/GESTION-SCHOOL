import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ParentPortalService } from './parent-portal.service';

@Controller('parent-portal')
@ApiTags('Parent Portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PARENT')
@ApiBearerAuth()
export class ParentPortalController {
  constructor(private readonly parentPortalService: ParentPortalService) {}

  @Get('children')
  children(@CurrentUser() user: AuthUser) {
    return this.parentPortalService.children(user);
  }

  @Get('children/:studentId')
  childDetail(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.parentPortalService.childDetail(user, studentId);
  }
}

import { RequirePermissions } from '../authz/decorators';
import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ParentPortalService } from './parent-portal.service';

@Controller('parent-portal')
@ApiTags('Parent Portal')
@ApiBearerAuth()
export class ParentPortalController {
  constructor(private readonly parentPortalService: ParentPortalService) {}

  @RequirePermissions('parent-portal:read')
  @Get('children')
  children(@CurrentUser() user: AuthUser) {
    return this.parentPortalService.children(user);
  }

  @RequirePermissions('parent-portal:read')
  @Get('children/:studentId')
  childDetail(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.parentPortalService.childDetail(user, studentId);
  }
}

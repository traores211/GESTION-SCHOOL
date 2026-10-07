import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PermissionsService } from './permissions.service';

class SetPermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  keys!: string[];
}

@Controller()
@ApiTags('Permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  /** Catalogue of permissions grouped by domain (shown in the back-office picker). */
  @Get('permissions/catalog')
  @Roles('SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR')
  catalog() {
    return this.service.catalog();
  }

  /** Explicit permissions of one user, with the role implication side by side. */
  @Get('users/:id/permissions')
  @Roles('SUPER_ADMIN', 'ADMIN_ORGANISATION')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.report(user, id);
  }

  /** Replaces the explicit permissions of a user with the exact set provided. */
  @Put('users/:id/permissions')
  @Roles('SUPER_ADMIN', 'ADMIN_ORGANISATION')
  set(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetPermissionsDto) {
    return this.service.set(user, id, dto.keys);
  }
}

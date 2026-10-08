import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { DomainsService } from './domains.service';
import { CreateDomainDto, UpdateDomainDto } from './domains.dto';

@Controller()
@ApiTags('Domains')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DomainsController {
  constructor(private readonly service: DomainsService) {}

  /** List the domains visible to the caller. The platform admin may filter by school or organisation. */
  @Get('domains')
  @Roles('SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR')
  list(@CurrentUser() user: AuthUser, @Query('schoolId') schoolId?: string, @Query('organisationId') organisationId?: string) {
    return this.service.list(user, { schoolId, organisationId });
  }

  @Get('domains/:id')
  @Roles('SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  /** The DNS record a school owner has to publish before verification succeeds. */
  @Get('domains/:id/verification')
  @Roles('SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR')
  verification(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.verificationInstructions(user, id);
  }

  /** Create a new domain under a school. Starts PENDING unless it is a platform subdomain. */
  @Post('schools/:schoolId/domains')
  @Roles('SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR')
  create(@CurrentUser() user: AuthUser, @Param('schoolId') schoolId: string, @Body() dto: CreateDomainDto) {
    return this.service.create(user, schoolId, dto);
  }

  @Patch('domains/:id')
  @Roles('SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDomainDto) {
    return this.service.update(user, id, dto);
  }

  /** Try the DNS TXT challenge now and promote the domain to ACTIVE on success. */
  @Post('domains/:id/verify')
  @Roles('SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR')
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.verify(user, id);
  }

  @Delete('domains/:id')
  @Roles('SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}

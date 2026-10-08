import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { MANAGEMENT } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './audit.dto';

/** The journal is read by management only. */
@Controller('audit')
@ApiTags('Audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...MANAGEMENT)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: AuditQueryDto) {
    return this.audit.list(user, q);
  }

  @Get('filters')
  filters(@CurrentUser() user: AuthUser) {
    return this.audit.filters(user);
  }
}

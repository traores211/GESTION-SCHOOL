import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Equals, IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LoginRateLimiter } from '../auth/login-rate-limiter';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PlatformService } from './platform.service';
import { LifecycleService } from './lifecycle.service';
import { LIFECYCLE_STATES } from './lifecycle';

class SignupDto {
  @IsString()
  @MinLength(3, { message: "Indiquez le nom de l'établissement" })
  @MaxLength(120)
  schoolName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email!: string;

  @IsString()
  @MaxLength(200)
  password!: string;

  @Equals(true, { message: "Vous devez accepter les conditions d'utilisation et la politique de protection des données" })
  consent!: boolean;
}

class UpdateOrganisationDto {
  @IsOptional()
  @IsIn([...LIFECYCLE_STATES])
  status?: (typeof LIFECYCLE_STATES)[number];

  @IsOptional()
  @IsIn(['STARTER', 'PRO', 'ENTERPRISE'])
  plan?: string;

  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

class TransitionDto {
  @IsIn([...LIFECYCLE_STATES])
  to!: (typeof LIFECYCLE_STATES)[number];

  @IsOptional()
  @IsIn(['STARTER', 'PRO', 'ENTERPRISE'])
  plan?: string;

  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

class SchoolActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

@Controller()
@ApiTags('Platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly limiter: LoginRateLimiter,
    private readonly lifecycle: LifecycleService,
  ) {}

  @Get('public/signup')
  signupInfo() {
    return { enabled: this.platform.signupEnabled };
  }

  /** A school creates its own space: organisation, school, current year and the head's account. */
  @Post('public/signup')
  async signup(@Body() dto: SignupDto, @Req() req: Request) {
    if (!(await this.limiter.hit(`signup:${req.ip}`, 5, 3600))) throw new HttpException('Trop de demandes. Réessayez dans une heure.', HttpStatus.TOO_MANY_REQUESTS);
    return this.platform.signup(dto);
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  subscription(@CurrentUser() user: AuthUser) {
    return this.platform.mySubscription(user);
  }

  @Get('platform/organisations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  organisations() {
    return this.platform.organisations();
  }

  @Patch('platform/schools/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  setSchoolActive(@Param('id') id: string, @Body() dto: SchoolActiveDto) {
    return this.platform.setSchoolActive(id, dto.isActive);
  }

  @Patch('platform/organisations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOrganisationDto) {
    return this.platform.updateOrganisation(user, id, dto);
  }

  /**
   * Explicit state-machine transition: the server validates it against the allowed moves and
   * writes a lifecycle event. Prefer this endpoint over PATCH when the back office needs to
   * record a reason or a free-text message with the change.
   */
  @Post('platform/organisations/:id/transition')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  transition(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransitionDto) {
    // Both endpoints share the same service entry; translate the explicit `to` field onto the
    // generic `status` the service expects.
    return this.platform.updateOrganisation(user, id, { status: dto.to, plan: dto.plan, trialEndsAt: dto.trialEndsAt, message: dto.message });
  }

  /** History of subscription transitions of an organisation (newest first). */
  @Get('platform/organisations/:id/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  history(@Param('id') id: string) {
    return this.lifecycle.history(id);
  }
}

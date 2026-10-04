import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Equals, IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LoginRateLimiter } from '../auth/login-rate-limiter';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PlatformService } from './platform.service';

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
  @IsIn(['TRIAL', 'ACTIVE', 'SUSPENDED'])
  status?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED';

  @IsOptional()
  @IsIn(['STARTER', 'PRO', 'ENTERPRISE'])
  plan?: string;

  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;
}

@Controller()
@ApiTags('Platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly limiter: LoginRateLimiter,
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

  @Patch('platform/organisations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  update(@Param('id') id: string, @Body() dto: UpdateOrganisationDto) {
    return this.platform.updateOrganisation(id, dto);
  }
}

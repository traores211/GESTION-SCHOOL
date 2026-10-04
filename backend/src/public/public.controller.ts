import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Equals, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { MANAGEMENT } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { LoginRateLimiter } from '../auth/login-rate-limiter';
import { PublicService } from './public.service';
import { PublicAdmissionDto } from './dto/public-admission.dto';

class TrackAdmissionDto {
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  reference!: string;

  @IsEmail()
  email!: string;
}

class ContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @MinLength(10, { message: 'Votre message est trop court' })
  @MaxLength(2000)
  message!: string;

  @Equals(true, { message: "Vous devez accepter l'utilisation de vos coordonnées pour vous répondre" })
  consent!: boolean;
}

@Controller('public/schools')
@ApiTags('Public Showcase')
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly limiter: LoginRateLimiter,
  ) {}

  @Get(':code/showcase')
  getShowcase(@Param('code') code: string) {
    return this.publicService.getShowcase(code);
  }

  /** The page as it would look once the draft is published, for the management of that school. */
  @Get(':code/showcase/preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MANAGEMENT)
  @ApiBearerAuth()
  preview(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.publicService.previewShowcase(user, code);
  }

  /** Contact form of the public page. */
  @Post(':code/contact')
  @HttpCode(200)
  async contact(@Param('code') code: string, @Body() dto: ContactDto, @Req() req: Request) {
    if (!(await this.limiter.hit(`contact:${req.ip}`, 5, 3600))) throw new HttpException('Trop de messages envoyés. Réessayez dans une heure.', HttpStatus.TOO_MANY_REQUESTS);
    return this.publicService.contact(code, dto);
  }

  /** A family follows its application with the dossier number and the e-mail given when applying. */
  @Post(':code/admissions/track')
  @HttpCode(200)
  async track(@Param('code') code: string, @Body() dto: TrackAdmissionDto, @Req() req: Request) {
    if (!(await this.limiter.hit(`track:${req.ip}`, 20, 600))) throw new HttpException('Trop de recherches. Réessayez dans quelques minutes.', HttpStatus.TOO_MANY_REQUESTS);
    return this.publicService.trackAdmission(code, dto.reference, dto.email);
  }

  @Post(':code/admissions')
  submitAdmission(@Param('code') code: string, @Body() dto: PublicAdmissionDto) {
    return this.publicService.submitAdmission(code, dto);
  }
}

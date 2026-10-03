import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
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

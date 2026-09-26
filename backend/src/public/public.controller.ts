import { Public } from '../authz/decorators';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ContactMessageDto } from '../school-settings/dto';
import { PublicService } from './public.service';
import { PublicAdmissionDto } from './dto/public-admission.dto';

/** Anti-spam for public forms: PUBLIC_FORM_RATE_LIMIT per minute and per IP (default 5). */
const formLimit = { default: { limit: () => Number(process.env.PUBLIC_FORM_RATE_LIMIT) || 5, ttl: 60_000 } };

@Controller('public')
@ApiTags('Public Showcase')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Public()
  @Get('schools/:code/showcase')
  getShowcase(@Param('code') code: string) {
    return this.publicService.getShowcase(code);
  }

  @Public()
  @Throttle(formLimit)
  @Post('schools/:code/admissions')
  submitAdmission(@Param('code') code: string, @Body() dto: PublicAdmissionDto) {
    return this.publicService.submitAdmission(code, dto);
  }

  @Public()
  @Throttle(formLimit)
  @Post('schools/:code/contact')
  submitContact(@Param('code') code: string, @Body() dto: ContactMessageDto) {
    return this.publicService.submitContact(code, dto);
  }

  @Public()
  @Get('resolve')
  resolve(@Query('host') host = '') {
    return this.publicService.resolveHost(host);
  }

  @Public()
  @Get('documents/verify/:code')
  verifyDocument(@Param('code') code: string) {
    return this.publicService.verifyDocument(code);
  }
}

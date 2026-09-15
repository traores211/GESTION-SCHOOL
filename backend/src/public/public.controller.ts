import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { PublicAdmissionDto } from './dto/public-admission.dto';

@Controller('public/schools')
@ApiTags('Public Showcase')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get(':code/showcase')
  getShowcase(@Param('code') code: string) {
    return this.publicService.getShowcase(code);
  }

  @Post(':code/admissions')
  submitAdmission(@Param('code') code: string, @Body() dto: PublicAdmissionDto) {
    return this.publicService.submitAdmission(code, dto);
  }
}

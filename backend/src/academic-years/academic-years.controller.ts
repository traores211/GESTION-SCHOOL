import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';

@Controller('academic-years')
@ApiTags('Academic Years')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AcademicYearsController {
  constructor(private readonly academicYearsService: AcademicYearsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.academicYearsService.findAll(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAcademicYearDto) {
    return this.academicYearsService.create(user, dto);
  }

  @Patch(':id/set-current')
  setCurrent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicYearsService.setCurrent(user, id);
  }
}

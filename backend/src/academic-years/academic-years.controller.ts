import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ALL_STAFF, MANAGEMENT, SUPERVISION } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';

@Controller('academic-years')
@ApiTags('Academic Years')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_STAFF, ...SUPERVISION)
@ApiBearerAuth()
export class AcademicYearsController {
  constructor(private readonly academicYearsService: AcademicYearsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.academicYearsService.findAll(user);
  }

  @Roles(...MANAGEMENT)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAcademicYearDto) {
    return this.academicYearsService.create(user, dto);
  }

  @Roles(...MANAGEMENT)
  @Patch(':id/set-current')
  setCurrent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicYearsService.setCurrent(user, id);
  }
}

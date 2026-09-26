import { RequirePermissions } from '../authz/decorators';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';

@Controller('academic-years')
@ApiTags('Academic Years')
@ApiBearerAuth()
export class AcademicYearsController {
  constructor(private readonly academicYearsService: AcademicYearsService) {}

  @RequirePermissions('academic:read')
  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.academicYearsService.findAll(user);
  }

  @RequirePermissions('academic:write')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAcademicYearDto) {
    return this.academicYearsService.create(user, dto);
  }

  @RequirePermissions('academic:write')
  @Patch(':id/set-current')
  setCurrent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicYearsService.setCurrent(user, id);
  }
}

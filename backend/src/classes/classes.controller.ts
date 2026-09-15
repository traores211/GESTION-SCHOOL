import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Controller('classes')
@ApiTags('Classes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClassDto) {
    return this.classesService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('academicYearId') academicYearId?: string) {
    return this.classesService.findAll(user, academicYearId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.classesService.findOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.classesService.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.classesService.remove(user, id);
  }

  @Post(':id/enroll/:studentId')
  enroll(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.classesService.enroll(user, id, studentId);
  }

  @Post(':id/unenroll/:studentId')
  unenroll(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.classesService.unenroll(user, id, studentId);
  }
}

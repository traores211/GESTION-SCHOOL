import { RequirePermissions } from '../authz/decorators';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Controller('classes')
@ApiTags('Classes')
@ApiBearerAuth()
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @RequirePermissions('classes:write')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClassDto) {
    return this.classesService.create(user, dto);
  }

  @RequirePermissions('classes:read')
  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('academicYearId') academicYearId?: string) {
    return this.classesService.findAll(user, academicYearId);
  }

  @RequirePermissions('classes:read')
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.classesService.findOne(user, id);
  }

  @RequirePermissions('classes:write')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.classesService.update(user, id, dto);
  }

  @RequirePermissions('classes:write')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.classesService.remove(user, id);
  }

  @RequirePermissions('classes:write')
  @Post(':id/enroll/:studentId')
  enroll(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.classesService.enroll(user, id, studentId);
  }

  @RequirePermissions('classes:write')
  @Post(':id/unenroll/:studentId')
  unenroll(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.classesService.unenroll(user, id, studentId);
  }
}

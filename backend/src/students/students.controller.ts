import { RequirePermissions } from '../authz/decorators';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Controller('students')
@ApiTags('Students')
@ApiBearerAuth()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @RequirePermissions('students:write')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.studentsService.create(user, dto);
  }

  @RequirePermissions('students:read')
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query('search') search?: string,
    @Query('classId') classId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const { items, total } = await this.studentsService.findAll(
      user,
      search,
      classId,
      Number(page) || 1,
      Number(pageSize) || 500,
    );
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  @RequirePermissions('students:read')
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.studentsService.findOne(user, id);
  }

  @RequirePermissions('students:write')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(user, id, dto);
  }

  @RequirePermissions('students:delete')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.studentsService.remove(user, id);
  }
}

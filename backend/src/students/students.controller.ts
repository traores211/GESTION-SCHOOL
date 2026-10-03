import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { OFFICE, TEACHING } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../common/pagination';

class StudentQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: string;
}

@Controller('students')
@ApiTags('Students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...TEACHING, 'COMPTABLE')
@ApiBearerAuth()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Roles(...OFFICE)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.studentsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() q: StudentQueryDto) {
    return this.studentsService.findAll(user, q.search, q.classId, q, q.archived === 'true');
  }

  @Roles(...OFFICE)
  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.studentsService.restore(user, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.studentsService.findOne(user, id);
  }

  @Roles(...OFFICE)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(user, id, dto);
  }

  /** Archives the student (history kept); see restore. */
  @Roles(...OFFICE)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('reason') reason?: string) {
    return this.studentsService.remove(user, id, reason?.slice(0, 300));
  }
}

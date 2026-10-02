import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ALL_STAFF, MANAGEMENT } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';

class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}

class AssignSubjectDto {
  @IsString()
  classId!: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  coefficient?: number;
}

@Controller('subjects')
@ApiTags('Subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_STAFF)
@ApiBearerAuth()
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Roles(...MANAGEMENT)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.subjectsService.findAll(user);
  }

  @Roles(...MANAGEMENT)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.subjectsService.update(user, id, dto);
  }

  @Roles(...MANAGEMENT)
  @Post(':id/assign')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignSubjectDto) {
    return this.subjectsService.assignToClass(user, id, dto.classId, dto.teacherId, dto.coefficient);
  }

  @Roles(...MANAGEMENT)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.subjectsService.remove(user, id);
  }
}

import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';

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
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.subjectsService.findAll(user);
  }

  @Post(':id/assign')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignSubjectDto) {
    return this.subjectsService.assignToClass(user, id, dto.classId, dto.teacherId, dto.coefficient);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.subjectsService.remove(user, id);
  }
}

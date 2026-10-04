import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { OFFICE, FIELD } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_PHOTO_BYTES, StudentExtrasService } from './student-extras.service';

class PupilAccountDto {
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email!: string;
}
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
@Roles(...FIELD, 'COMPTABLE')
@ApiBearerAuth()
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly extras: StudentExtrasService,
  ) {}

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

  @Roles(...OFFICE)
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  savePhoto(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file: { buffer: Buffer; size: number } | undefined) {
    return this.extras.savePhoto(user, id, file);
  }

  @Get(':id/photo')
  async photo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const file = await this.extras.photo(user, id);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.buffer);
  }

  /** An account for the pupil himself (student portal); the temporary password is returned once. */
  @Roles(...OFFICE)
  @Post(':id/account')
  createAccount(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PupilAccountDto) {
    return this.extras.createAccount(user, id, dto.email);
  }

  @Roles(...OFFICE)
  @Delete(':id/account')
  removeAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.extras.removeAccount(user, id);
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

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { GradesService } from './grades.service';
import { EnterGradesDto } from './dto/enter-grades.dto';

@Controller('grades')
@ApiTags('Grades')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Post()
  enter(@CurrentUser() user: AuthUser, @Body() dto: EnterGradesDto) {
    return this.gradesService.enter(user, dto);
  }

  @Get('class/:classId')
  findByClass(
    @CurrentUser() user: AuthUser,
    @Param('classId') classId: string,
    @Query('termId') termId?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.gradesService.findByClass(user, classId, termId, subjectId);
  }

  @Get('student/:studentId')
  findByStudent(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Query('termId') termId?: string) {
    return this.gradesService.findByStudent(user, studentId, termId);
  }

  @Get('bulletin/:studentId/:termId')
  bulletin(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Param('termId') termId: string) {
    return this.gradesService.computeBulletin(user, studentId, termId);
  }
}

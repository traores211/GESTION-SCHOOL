import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

class JustifyDto {
  @IsString()
  justification!: string;
}

@Controller('attendance')
@ApiTags('Attendance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('mark')
  mark(@CurrentUser() user: AuthUser, @Body() dto: MarkAttendanceDto) {
    return this.attendanceService.mark(user, dto);
  }

  @Get()
  findByClassAndDate(@CurrentUser() user: AuthUser, @Query('classId') classId: string, @Query('date') date: string) {
    return this.attendanceService.findByClassAndDate(user, classId, date);
  }

  @Get('today-stats')
  todayStats(@CurrentUser() user: AuthUser) {
    return this.attendanceService.todayStats(user);
  }

  @Get('student/:studentId')
  findByStudent(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.attendanceService.findByStudent(user, studentId);
  }

  @Patch(':id/justify')
  justify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: JustifyDto) {
    return this.attendanceService.justify(user, id, dto.justification);
  }
}

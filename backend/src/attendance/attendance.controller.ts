import { RequirePermissions } from '../authz/decorators';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

class JustifyDto {
  @IsString()
  justification!: string;
}

@Controller('attendance')
@ApiTags('Attendance')
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @RequirePermissions('attendance:write')
  @Post('mark')
  mark(@CurrentUser() user: AuthUser, @Body() dto: MarkAttendanceDto) {
    return this.attendanceService.mark(user, dto);
  }

  @RequirePermissions('attendance:read')
  @Get()
  findByClassAndDate(@CurrentUser() user: AuthUser, @Query('classId') classId: string, @Query('date') date: string) {
    return this.attendanceService.findByClassAndDate(user, classId, date);
  }

  @RequirePermissions('attendance:read')
  @Get('today-stats')
  todayStats(@CurrentUser() user: AuthUser) {
    return this.attendanceService.todayStats(user);
  }

  @RequirePermissions('attendance:read')
  @Get('student/:studentId')
  findByStudent(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.attendanceService.findByStudent(user, studentId);
  }

  @RequirePermissions('attendance:write')
  @Patch(':id/justify')
  justify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: JustifyDto) {
    return this.attendanceService.justify(user, id, dto.justification);
  }
}

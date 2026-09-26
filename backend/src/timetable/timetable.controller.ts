import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RequirePermissions } from '../authz/decorators';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { RequireFeature } from '../platform/feature.guard';
import { TimetableService } from './timetable.service';

class SlotDto {
  @IsInt() @Min(1) @Max(6) day!: number;
  @IsInt() @Min(1) @Max(12) period!: number;
}

class AvoidDto {
  @IsString() subjectId!: string;
  @IsArray() @IsInt({ each: true }) periods!: number[];
}

class ConstraintsDto {
  @IsOptional() @IsInt() @Min(1) @Max(6) maxPerDayPerSubject?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => SlotDto) blockedSlots?: SlotDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => AvoidDto) avoid?: AvoidDto[];
}

class GenerateDto {
  @IsOptional() @IsArray() @IsString({ each: true }) classIds?: string[];
  @IsOptional() @ValidateNested() @Type(() => ConstraintsDto) constraints?: ConstraintsDto;
}

class SettingsDto {
  @IsArray() @IsInt({ each: true }) days!: number[];
  @IsInt() @Min(1) @Max(12) periodsPerDay!: number;
  @IsArray() @IsString({ each: true }) periodLabels!: string[];
}

class EntryDto {
  @IsInt() @Min(1) @Max(6) day!: number;
  @IsInt() @Min(1) @Max(12) period!: number;
  @IsString() subjectId!: string;
  @IsOptional() @IsString() teacherId!: string | null;
  @IsOptional() @IsString() roomId!: string | null;
}

class DraftDto {
  @IsArray() @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => EntryDto) entries!: EntryDto[];
}

class RoomDto {
  @IsString() @MaxLength(60) name!: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
}

class HoursDto {
  @IsInt() @Min(0) @Max(20) weeklyHours!: number;
}

@Controller('timetable')
@ApiTags('Timetable')
@ApiBearerAuth()
@RequireFeature('timetable')
export class TimetableController {
  constructor(private readonly service: TimetableService) {}

  @RequirePermissions('timetable:read')
  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.service.settings(user);
  }

  @RequirePermissions('timetable:write')
  @Put('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: SettingsDto) {
    return this.service.updateSettings(user, dto);
  }

  @RequirePermissions('timetable:read')
  @Get('rooms')
  rooms(@CurrentUser() user: AuthUser) {
    return this.service.rooms(user);
  }

  @RequirePermissions('timetable:write')
  @Post('rooms')
  createRoom(@CurrentUser() user: AuthUser, @Body() dto: RoomDto) {
    return this.service.createRoom(user, dto.name, dto.capacity);
  }

  @RequirePermissions('timetable:write')
  @Delete('rooms/:id')
  deleteRoom(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteRoom(user, id);
  }

  @RequirePermissions('timetable:write')
  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateDto) {
    return this.service.generate(user, dto.classIds, dto.constraints);
  }

  @RequirePermissions('timetable:read')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.mine(user);
  }

  @RequirePermissions('timetable:read')
  @Get('classes/:classId')
  get(@CurrentUser() user: AuthUser, @Param('classId') classId: string, @Query('status') status?: string) {
    return this.service.get(user, classId, status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED');
  }

  @RequirePermissions('timetable:write')
  @Put('classes/:classId/draft')
  updateDraft(@CurrentUser() user: AuthUser, @Param('classId') classId: string, @Body() dto: DraftDto) {
    return this.service.updateDraft(user, classId, dto.entries.map((e) => ({ ...e, teacherId: e.teacherId ?? null, roomId: e.roomId ?? null })));
  }

  @RequirePermissions('timetable:write')
  @Get('classes/:classId/check')
  check(@CurrentUser() user: AuthUser, @Param('classId') classId: string) {
    return this.service.check(user, classId);
  }

  @RequirePermissions('timetable:write')
  @Post('classes/:classId/publish')
  publish(@CurrentUser() user: AuthUser, @Param('classId') classId: string) {
    return this.service.publish(user, classId);
  }

  @RequirePermissions('timetable:write')
  @Patch('classes/:classId/subjects/:subjectId/hours')
  hours(@CurrentUser() user: AuthUser, @Param('classId') classId: string, @Param('subjectId') subjectId: string, @Body() dto: HoursDto) {
    return this.service.setWeeklyHours(user, classId, subjectId, dto.weeklyHours);
  }

  @RequirePermissions('timetable:read')
  @Get('classes/:classId/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="emploi-du-temps.csv"')
  csv(@CurrentUser() user: AuthUser, @Param('classId') classId: string) {
    return this.service.exportCsv(user, classId);
  }

  @RequirePermissions('timetable:read')
  @Get('classes/:classId/export.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="emploi-du-temps.ics"')
  ics(@CurrentUser() user: AuthUser, @Param('classId') classId: string) {
    return this.service.exportIcs(user, classId);
  }
}

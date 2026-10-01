import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ArrayMaxSize, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ALL_STAFF, OFFICE } from '../common/roles';
import { TimetableService } from './timetable.service';
import { TimetableImportService, MAX_IMPORT_BYTES } from './import/import.service';
import { ImportCommitDto, ImportRowDto } from './import/import.dto';
import {
  CheckSlotDto,
  DuplicateSessionDto,
  RoomDto,
  SessionDto,
  TimetableQueryDto,
  TimetableSettingsDto,
  UpdateRoomDto,
  UpdateSessionDto,
} from './dto/timetable.dto';

class ResolveRowsDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
}

/** Everyone on the staff reads timetables; office roles edit them. */
@Controller('timetable')
@ApiTags('Timetable')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_STAFF)
@ApiBearerAuth()
export class TimetableController {
  constructor(
    private readonly timetable: TimetableService,
    private readonly importer: TimetableImportService,
  ) {}

  @Get('resources')
  @ApiOperation({ summary: 'Classes, subjects, teachers, rooms, terms and grid settings for the editor' })
  resources(@CurrentUser() user: AuthUser, @Query('academicYearId') academicYearId?: string) {
    return this.timetable.resources(user, academicYearId);
  }

  @Get('sessions')
  list(@CurrentUser() user: AuthUser, @Query() query: TimetableQueryDto) {
    return this.timetable.list(user, query);
  }

  @Get('conflicts')
  conflicts(@CurrentUser() user: AuthUser, @Query() query: TimetableQueryDto) {
    return this.timetable.conflicts(user, query);
  }

  @Post('check')
  @ApiOperation({ summary: 'Conflicts a slot would have, without saving it' })
  check(@CurrentUser() user: AuthUser, @Body() dto: CheckSlotDto) {
    return this.timetable.check(user, dto);
  }

  @Roles(...OFFICE)
  @Post('sessions')
  create(@CurrentUser() user: AuthUser, @Body() dto: SessionDto) {
    return this.timetable.create(user, dto);
  }

  @Roles(...OFFICE)
  @Patch('sessions/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.timetable.update(user, id, dto);
  }

  @Roles(...OFFICE)
  @Post('sessions/:id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DuplicateSessionDto) {
    return this.timetable.duplicate(user, id, dto);
  }

  @Roles(...OFFICE)
  @Delete('sessions/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timetable.remove(user, id);
  }

  // ---------- settings
  @Get('settings')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.timetable.getSettings(user);
  }

  @Roles(...OFFICE)
  @Patch('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: TimetableSettingsDto) {
    return this.timetable.updateSettings(user, dto);
  }

  // ---------- rooms
  @Get('rooms')
  rooms(@CurrentUser() user: AuthUser) {
    return this.timetable.listRooms(user);
  }

  @Roles(...OFFICE)
  @Post('rooms')
  createRoom(@CurrentUser() user: AuthUser, @Body() dto: RoomDto) {
    return this.timetable.createRoom(user, dto);
  }

  @Roles(...OFFICE)
  @Patch('rooms/:id')
  updateRoom(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.timetable.updateRoom(user, id, dto);
  }

  @Roles(...OFFICE)
  @Delete('rooms/:id')
  removeRoom(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timetable.removeRoom(user, id);
  }

  // ---------- import: file → analysis → preview → commit
  @Get('import/capabilities')
  capabilities() {
    return this.importer.capabilities();
  }

  @Roles(...OFFICE)
  @Post('import/analyze')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Step 1: extract lessons from a file (xlsx, csv, pdf, docx, png, jpg). Nothing is saved.' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  analyze(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
    @Query('ai', new ParseBoolPipe({ optional: true })) ai?: boolean,
  ) {
    return this.importer.analyze(user, file, !!ai);
  }

  @Roles(...OFFICE)
  @Post('import/resolve')
  @ApiOperation({ summary: 'Re-match names after edits in the preview' })
  resolve(@CurrentUser() user: AuthUser, @Body() dto: ResolveRowsDto) {
    return this.importer.resolve(user, dto.rows);
  }

  @Roles(...OFFICE)
  @Post('import/preview')
  @ApiOperation({ summary: 'Step 2: validate, schedule volumes and detect conflicts. Nothing is saved.' })
  preview(@CurrentUser() user: AuthUser, @Body() dto: ImportCommitDto) {
    return this.importer.preview(user, dto);
  }

  @Roles(...OFFICE)
  @Post('import/commit')
  @ApiOperation({ summary: 'Step 3: create the sessions (and the entities the user chose to create)' })
  commit(@CurrentUser() user: AuthUser, @Body() dto: ImportCommitDto) {
    return this.importer.commit(user, dto);
  }

  @Get('imports')
  imports(@CurrentUser() user: AuthUser) {
    return this.timetable.listImports(user);
  }

  @Roles(...OFFICE)
  @Delete('imports/:id')
  @ApiOperation({ summary: 'Undo an import (removes the sessions it created)' })
  undoImport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timetable.undoImport(user, id);
  }
}

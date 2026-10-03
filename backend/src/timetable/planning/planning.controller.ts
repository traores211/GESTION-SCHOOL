import { Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { ALL_STAFF, OFFICE } from '../../common/roles';
import { PlanningService } from './planning.service';
import { PlanningImportService, MAX_PLANNING_BYTES } from './planning-import.service';
import { TimetableExportService } from './timetable-export.service';
import { PlanningCommitDto } from './planning-import.dto';
import { ExportQueryDto, GenerateApplyDto, GenerateScopeDto, HistoryQueryDto, LockClassDto, LockDto, OptionsQueryDto, SwapDto } from './planning.dto';

/** Planning: teacher data import, generation, adjustments, history, compliance and exports. */
@Controller('timetable')
@ApiTags('Timetable planning')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_STAFF)
@ApiBearerAuth()
export class PlanningController {
  constructor(
    private readonly planning: PlanningService,
    private readonly importer: PlanningImportService,
    private readonly exporter: TimetableExportService,
  ) {}

  // ---------- lesson form
  @Get('options')
  @ApiOperation({ summary: 'Qualified teachers, suitable rooms and free slots for the lesson form' })
  options(@CurrentUser() user: AuthUser, @Query() q: OptionsQueryDto) {
    return this.planning.options(user, q);
  }

  @Get('sessions/:id/suggestions')
  @ApiOperation({ summary: 'Valid alternative slots, teachers and rooms for a lesson' })
  suggestions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.planning.suggestions(user, id);
  }

  // ---------- adjustments
  @Roles(...OFFICE)
  @Post('sessions/:id/swap')
  swap(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SwapDto) {
    return this.planning.swap(user, id, dto.otherId);
  }

  @Roles(...OFFICE)
  @Patch('sessions/:id/lock')
  lock(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LockDto) {
    return this.planning.lock(user, id, dto.locked);
  }

  @Roles(...OFFICE)
  @Post('lock-class')
  lockClass(@CurrentUser() user: AuthUser, @Body() dto: LockClassDto) {
    return this.planning.lockClass(user, dto.classId, dto.locked);
  }

  // ---------- history
  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query() q: HistoryQueryDto) {
    return this.planning.history(user, q.academicYearId, q.limit);
  }

  @Roles(...OFFICE)
  @Post('history/:batchId/undo')
  undo(@CurrentUser() user: AuthUser, @Param('batchId') batchId: string) {
    return this.planning.undo(user, batchId);
  }

  // ---------- generation
  @Roles(...OFFICE)
  @Post('generate/preview')
  @ApiOperation({ summary: 'Generate a timetable proposal for all classes, a level or a class. Nothing is saved.' })
  preview(@CurrentUser() user: AuthUser, @Body() dto: GenerateScopeDto) {
    return this.planning.generatePreview(user, dto);
  }

  @Roles(...OFFICE)
  @Post('generate/apply')
  @ApiOperation({ summary: 'Save a proposal (unlocked lessons of the scope are replaced, locked ones kept)' })
  apply(@CurrentUser() user: AuthUser, @Body() dto: GenerateApplyDto) {
    return this.planning.generateApply(user, dto);
  }

  // ---------- compliance & exports
  @Get('compliance')
  compliance(@CurrentUser() user: AuthUser, @Query('academicYearId') academicYearId?: string) {
    return this.planning.compliance(user, academicYearId);
  }

  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Query() q: ExportQueryDto, @Res() res: Response) {
    const file = await this.exporter.export(user, q);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.buffer);
  }

  // ---------- planning data import
  @Get('planning')
  overview(@CurrentUser() user: AuthUser) {
    return this.importer.overview(user);
  }

  @Get('planning/template')
  async template(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const buffer = await this.importer.template(user);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modele-planification-emplois-du-temps.xlsx"');
    res.send(buffer);
  }

  @Roles(...OFFICE)
  @Post('planning/import/analyze')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Validate a planning file (teachers + official volumes). Nothing is saved.' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PLANNING_BYTES, files: 1 } }))
  analyze(@CurrentUser() user: AuthUser, @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined) {
    return this.importer.analyze(user, file);
  }

  @Roles(...OFFICE)
  @Post('planning/import/commit')
  @ApiOperation({ summary: 'Save the validated planning data' })
  commit(@CurrentUser() user: AuthUser, @Body() dto: PlanningCommitDto) {
    return this.importer.commit(user, dto);
  }
}

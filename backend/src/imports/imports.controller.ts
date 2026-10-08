import { BadRequestException, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ALL_STAFF, FINANCE, MANAGEMENT, OFFICE, TEACHING } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { IMPORT_SPECS, ImportKind, templateCsv } from './import-rules';
import { ImportsService, MAX_IMPORT_FILE_BYTES } from './imports.service';

/** Who may import what: the same people who may create these records one by one. */
const ALLOWED: Record<ImportKind, readonly string[]> = { students: OFFICE, staff: MANAGEMENT, balances: FINANCE, grades: TEACHING };

@Controller('imports')
@ApiTags('Imports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_STAFF)
@ApiBearerAuth()
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  private kind(user: AuthUser, raw: string): ImportKind {
    if (!(raw in IMPORT_SPECS)) throw new BadRequestException("Type d'import inconnu");
    if (!ALLOWED[raw as ImportKind].includes(user.role)) throw new ForbiddenException('Accès refusé');
    return raw as ImportKind;
  }

  /** Import types open to the signed-in user, with their columns. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return (Object.keys(IMPORT_SPECS) as ImportKind[])
      .filter((kind) => ALLOWED[kind].includes(user.role))
      .map((kind) => ({ kind, label: IMPORT_SPECS[kind].label, columns: IMPORT_SPECS[kind].columns.map((c) => ({ header: c.header, required: !!c.required, example: c.example })) }));
  }

  @Get(':kind/template')
  template(@CurrentUser() user: AuthUser, @Param('kind') raw: string, @Res() res: Response) {
    const kind = this.kind(user, raw);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="modele-${kind}.csv"`);
    res.send(templateCsv(kind));
  }

  /** Analyses the file; with `?commit=true` the valid rows are written. */
  @Post(':kind')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 } }))
  run(@CurrentUser() user: AuthUser, @Param('kind') raw: string, @Query('commit') commit: string | undefined, @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined) {
    return this.imports.run(user, this.kind(user, raw), file, commit === 'true');
  }
}

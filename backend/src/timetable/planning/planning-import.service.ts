import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/current-user.decorator';
import { TimetableService } from '../timetable.service';
import { XlsxParser } from '../import/parsers/xlsx.parser';
import { CsvParser } from '../import/parsers/csv.parser';
import { detectFileKind } from '../import/file-type';
import { DAY_NAMES } from '../domain/time';
import { formatHours } from '../domain/grid';
import { PlanningDataService, TEACHER_ROLES, displayName } from './planning-data.service';
import { ImportReference, TEACHER_HEADERS, VOLUME_HEADERS, analyzePlanningTables } from './planning-import';
import { PlanningCommitDto } from './planning-import.dto';

export const MAX_PLANNING_BYTES = 5 * 1024 * 1024;

@Injectable()
export class PlanningImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timetable: TimetableService,
    private readonly planning: PlanningDataService,
  ) {}

  private async reference(schoolId: string, yearId: string): Promise<ImportReference> {
    const [classes, subjects, teachers, grid] = await Promise.all([
      this.prisma.class.findMany({ where: { schoolId, academicYearId: yearId }, select: { id: true, name: true, level: true } }),
      this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, name: true, code: true } }),
      this.prisma.staffMember.findMany({
        where: { user: { schoolId, role: { in: [...TEACHER_ROLES] } } },
        select: { id: true, matricule: true, user: { select: { firstName: true, lastName: true } } },
      }),
      this.planning.loadGrid(schoolId, yearId),
    ]);
    return {
      classes,
      subjects,
      teachers: teachers.map((t) => ({ id: t.id, matricule: t.matricule, firstName: t.user.firstName, lastName: t.user.lastName, name: displayName(t.user) })),
      grid,
    };
  }

  /** Excel template with the two expected sheets, filled with examples taken from the school. */
  async template(user: AuthUser): Promise<Buffer> {
    const schoolId = this.timetable.requireSchool(user);
    const yearId = await this.timetable.resolveYearId(schoolId);
    const ref = await this.reference(schoolId, yearId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'School ERP';

    const style = (sheet: ExcelJS.Worksheet, headers: string[], widths: number[]) => {
      sheet.addRow(headers);
      sheet.columns = widths.map((width) => ({ width }));
      const head = sheet.getRow(1);
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D3B2B' } };
      head.alignment = { vertical: 'middle', wrapText: true };
      head.height = 30;
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    };

    const teachersSheet = workbook.addWorksheet('Professeurs');
    style(teachersSheet, TEACHER_HEADERS, [14, 18, 22, 26, 28, 12, 12, 12, 16]);
    const levels = [...new Set(ref.classes.map((c) => c.level))].sort();
    const subjects = ref.subjects.slice(0, 3);
    ref.teachers.slice(0, 3).forEach((t, i) => {
      const subject = subjects[i % Math.max(1, subjects.length)]?.name ?? 'Mathématiques';
      const scope = levels.slice(0, 2).join(', ') || '6ème';
      teachersSheet.addRow([t.matricule ?? `MAT-${String(i + 1).padStart(3, '0')}`, t.lastName, t.firstName, subject, scope, 'Lundi', '07:30', '12:30', 20]);
      teachersSheet.addRow([t.matricule ?? `MAT-${String(i + 1).padStart(3, '0')}`, t.lastName, t.firstName, subject, scope, 'Mardi', '14:30', '17:30', '']);
    });
    for (let r = 2; r <= 200; r++) {
      teachersSheet.getCell(r, 6).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${DAY_NAMES.slice(1, 7).join(',')}"`] };
    }

    const volumesSheet = workbook.addWorksheet('Volumes horaires officiels');
    style(volumesSheet, VOLUME_HEADERS, [16, 30, 16, 26, 14]);
    for (const level of levels.slice(0, 2)) {
      for (const s of ref.subjects.slice(0, 4)) volumesSheet.addRow([level, s.name, 4, 2, '']);
    }

    const help = workbook.addWorksheet("Mode d'emploi");
    help.columns = [{ width: 110 }];
    [
      'Onglet « Professeurs » : une ligne par créneau de disponibilité (un professeur peut avoir plusieurs lignes).',
      '  • Matricule : celui de la fiche du personnel (ou laissez vide et renseignez Nom + Prénoms).',
      '  • Matière(s) et Niveaux/classes : plusieurs valeurs séparées par des virgules (ex. « Mathématiques, Physique-Chimie » ; « 6ème, 5ème, 3ème B »).',
      '  • Jour : Lundi … Samedi ; heures au format 08:00. Volume hebdo max : obligation de service en heures (facultatif).',
      'Onglet « Volumes horaires officiels » : une ligne par niveau et matière, avec les heures par semaine validées par l’État,',
      '  la durée maximale d’une séance en heures et le coefficient (facultatif).',
      `Niveaux connus : ${levels.join(', ') || '(aucune classe)'}.`,
      `Matières connues : ${ref.subjects.map((s) => s.name).join(', ') || '(aucune)'}.`,
      'Après l’envoi, un rapport indique les lignes valides, en erreur (avec le motif) et les avertissements. Rien n’est enregistré sans votre confirmation.',
    ].forEach((line) => help.addRow([line]));

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Reads and validates the file. Nothing is saved. */
  async analyze(user: AuthUser, file: { buffer: Buffer; originalname: string; size: number } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier reçu');
    if (file.size > MAX_PLANNING_BYTES) throw new BadRequestException('Fichier trop volumineux (5 Mo maximum)');
    const schoolId = this.timetable.requireSchool(user);
    const yearId = await this.timetable.resolveYearId(schoolId);
    let detected;
    try {
      detected = detectFileKind(file.buffer, file.originalname);
    } catch {
      throw new BadRequestException('Format non reconnu : envoyez le modèle Excel (.xlsx) ou un fichier CSV');
    }
    if (detected.kind !== 'xlsx' && detected.kind !== 'csv') throw new BadRequestException('Format non pris en charge : envoyez un fichier Excel (.xlsx) ou CSV');
    const parser = detected.kind === 'xlsx' ? new XlsxParser() : new CsvParser();
    const doc = await parser.parse(file.buffer, detected);
    if (detected.kind === 'csv') doc.tables.forEach((t) => (t.name = t.name ?? file.originalname));
    const report = analyzePlanningTables(doc.tables, await this.reference(schoolId, yearId));
    if (!report.sheets.teachers && !report.sheets.volumes) {
      throw new BadRequestException('Aucun onglet « Professeurs » ni « Volumes horaires officiels » reconnu : utilisez le modèle téléchargeable');
    }
    return { fileName: file.originalname, ...report };
  }

  /**
   * Saves a validated payload. For each teacher of the file, qualifications and availabilities of the
   * year are replaced; official volumes of the levels present in the file are replaced.
   */
  async commit(user: AuthUser, dto: PlanningCommitDto) {
    const schoolId = this.timetable.requireSchool(user);
    const yearId = await this.timetable.resolveYearId(schoolId);
    const ref = await this.reference(schoolId, yearId);
    const teacherIds = new Set(ref.teachers.map((t) => t.id));
    const subjectIds = new Set(ref.subjects.map((s) => s.id));
    const levels = new Set(ref.classes.map((c) => c.level));
    const classIds = new Map(ref.classes.map((c) => [c.id, c.level]));
    for (const t of dto.teachers) {
      if (!teacherIds.has(t.teacherId)) throw new BadRequestException('Enseignant inconnu dans les données envoyées');
      for (const q of t.qualifications) {
        if (!subjectIds.has(q.subjectId) || !levels.has(q.level) || (q.classId && classIds.get(q.classId) !== q.level)) {
          throw new BadRequestException('Habilitation invalide dans les données envoyées : relancez l’analyse du fichier');
        }
      }
      for (const a of t.availability) if (a.startTime >= a.endTime) throw new BadRequestException('Disponibilité invalide dans les données envoyées');
    }
    for (const v of dto.volumes) {
      if (!subjectIds.has(v.subjectId) || !levels.has(v.level)) throw new BadRequestException('Volume horaire invalide dans les données envoyées : relancez l’analyse du fichier');
    }

    await this.prisma.$transaction(
      async (tx) => {
        for (const t of dto.teachers) {
          await tx.teacherQualification.deleteMany({ where: { staffMemberId: t.teacherId } });
          await tx.teacherAvailability.deleteMany({ where: { staffMemberId: t.teacherId, academicYearId: yearId } });
          if (t.qualifications.length) {
            await tx.teacherQualification.createMany({ data: t.qualifications.map((q) => ({ staffMemberId: t.teacherId, subjectId: q.subjectId, level: q.level, classId: q.classId ?? null })) });
          }
          if (t.availability.length) {
            await tx.teacherAvailability.createMany({ data: t.availability.map((a) => ({ staffMemberId: t.teacherId, academicYearId: yearId, ...a })) });
          }
          await tx.staffMember.update({
            where: { id: t.teacherId },
            data: { ...(t.weeklyMaxMinutes !== undefined ? { weeklyMaxMinutes: t.weeklyMaxMinutes } : {}), ...(t.matricule ? { matricule: t.matricule } : {}) },
          });
        }
        const fileLevels = [...new Set(dto.volumes.map((v) => v.level))];
        if (fileLevels.length) {
          await tx.officialVolume.deleteMany({ where: { schoolId, academicYearId: yearId, level: { in: fileLevels } } });
          await tx.officialVolume.createMany({ data: dto.volumes.map((v) => ({ ...v, maxSessionMinutes: v.maxSessionMinutes ?? null, coefficient: v.coefficient ?? null, schoolId, academicYearId: yearId })) });
        }
      },
      { timeout: 30_000 },
    );
    const hours = dto.volumes.reduce((s, v) => s + v.minutesPerWeek / 60, 0);
    return {
      success: true,
      teachers: dto.teachers.length,
      qualifications: dto.teachers.reduce((s, t) => s + t.qualifications.length, 0),
      availabilities: dto.teachers.reduce((s, t) => s + t.availability.length, 0),
      volumes: dto.volumes.length,
      volumeHours: formatHours(hours),
    };
  }

  /** Current planning data, for the overview screen. */
  async overview(user: AuthUser) {
    const schoolId = this.timetable.requireSchool(user);
    const yearId = await this.timetable.resolveYearId(schoolId);
    const data = await this.planning.loadData(schoolId, yearId);
    const volumes = await this.prisma.officialVolume.findMany({ where: { schoolId, academicYearId: yearId }, include: { subject: { select: { name: true } } }, orderBy: [{ level: 'asc' }] });
    const matricules = new Map((await this.prisma.staffMember.findMany({ where: { id: { in: [...data.teachers.keys()] } }, select: { id: true, matricule: true } })).map((m) => [m.id, m.matricule]));
    return {
      teachers: [...data.teachers.values()]
        .map((t) => ({
          id: t.id,
          name: t.name,
          matricule: matricules.get(t.id) ?? null,
          maxHours: t.weeklyMaxMinutes == null ? null : t.weeklyMaxMinutes / 60,
          qualifications: data.qualifications
            .filter((q) => q.teacherId === t.id)
            .map((q) => ({ subject: data.subjects.get(q.subjectId)?.name ?? '?', scope: q.classId ? data.classes.get(q.classId)?.name ?? q.level : q.level })),
          availability: (data.availability.get(t.id) ?? []).map((w) => ({ dayOfWeek: w.day, startTime: w.start, endTime: w.end })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      volumes: volumes
        .map((v) => ({ level: v.level, subject: v.subject.name, hours: v.minutesPerWeek / 60, maxSessionHours: v.maxSessionMinutes ? v.maxSessionMinutes / 60 : null, coefficient: v.coefficient }))
        .sort((a, b) => a.level.localeCompare(b.level) || a.subject.localeCompare(b.subject)),
    };
  }
}

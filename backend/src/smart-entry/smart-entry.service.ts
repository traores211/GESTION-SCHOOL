import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { TeacherScopeService } from '../common/teacher-scope.service';
import { detectDocument } from '../admissions/admissions.service';
import { MarkRow, RollRow, RosterPupil, matchSheetLines, parseRollCall, parseSpokenMarks } from './smart-entry-rules';
import { SheetLine, SheetReader } from './sheet-reader';

export const MAX_SHEET_BYTES = 6 * 1024 * 1024;

/**
 * Assisted entry: voice and image become a PROPOSAL. Nothing is written here: the teacher checks the
 * rows on screen, corrects them, and the validated result goes through the ordinary roll call and
 * marks routes, with their own checks (class of the teacher, subject, scale, closed year).
 */
@Injectable()
export class SmartEntryService {
  private reader = new SheetReader();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TeacherScopeService,
  ) {}

  /** For tests: a reader that does not call the outside. */
  useReader(reader: { isAvailable(): boolean; read(file: { buffer: Buffer; mime: string }, names: string[]): Promise<SheetLine[]> }) {
    this.reader = reader as SheetReader;
  }

  get imageReading() {
    return this.reader.isAvailable();
  }

  private async roster(user: AuthUser, classId: string) {
    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true, schoolId: true, enrollments: { where: { withdrawalDate: null, student: { archivedAt: null } }, select: { student: { select: { id: true, firstName: true, lastName: true, matricule: true } } }, orderBy: { student: { lastName: 'asc' } } } },
    });
    if (!klass || klass.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');
    await this.scope.assertClass(user, classId);
    return { klass, pupils: klass.enrollments.map((e) => e.student) };
  }

  private summary(rows: { studentId: string | null; confidence: string }[], pupils: RosterPupil[]) {
    const named = new Set(rows.map((r) => r.studentId).filter(Boolean));
    return {
      recognised: rows.filter((r) => r.confidence === 'SURE').length,
      toCheck: rows.filter((r) => r.confidence !== 'SURE').length,
      notMentioned: pupils.filter((p) => !named.has(p.id)).map((p) => ({ studentId: p.id, name: `${p.firstName} ${p.lastName}` })),
    };
  }

  private named<T extends RollRow | MarkRow>(rows: T[], pupils: RosterPupil[]) {
    return rows.map((r) => {
      const p = pupils.find((x) => x.id === r.studentId);
      return { ...r, name: p ? `${p.firstName} ${p.lastName}` : null };
    });
  }

  /** "Alice Kouassi présente, Paul Yao absent…" → proposed roll call. */
  async rollCall(user: AuthUser, classId: string, transcript: string) {
    const { klass, pupils } = await this.roster(user, classId);
    const rows = parseRollCall(transcript, pupils);
    return { class: klass.name, source: 'VOCAL', transcript, rows: this.named(rows, pupils), ...this.summary(rows, pupils), saved: false };
  }

  /** "Alice 15, Paul 12, Marc 17" → proposed marks. */
  async spokenMarks(user: AuthUser, classId: string, transcript: string, maxScore = 20) {
    const { klass, pupils } = await this.roster(user, classId);
    const rows = parseSpokenMarks(transcript, pupils, maxScore);
    return { class: klass.name, source: 'VOCAL', transcript, maxScore, rows: this.named(rows, pupils), ...this.summary(rows, pupils), saved: false };
  }

  /** A photographed or scanned marks sheet → proposed marks, every doubt of the reader carried to the screen. */
  async sheetMarks(user: AuthUser, classId: string, file: { buffer: Buffer; size: number } | undefined, maxScore = 20) {
    const { klass, pupils } = await this.roster(user, classId);
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier reçu');
    if (file.size > MAX_SHEET_BYTES) throw new BadRequestException('Fichier trop lourd (6 Mo maximum)');
    const type = detectDocument(file.buffer);
    if (!type) throw new BadRequestException('Format non accepté : photo JPEG ou PNG, ou PDF');
    if (!this.reader.isAvailable()) throw new ServiceUnavailableException("La lecture d'image n'est pas configurée sur ce serveur (clé ANTHROPIC_API_KEY). Utilisez la saisie vocale, l'import de fichier ou la saisie manuelle.");
    let lines: SheetLine[];
    try {
      lines = await this.reader.read({ buffer: file.buffer, mime: type.mime }, pupils.map((p) => `${p.lastName} ${p.firstName}`));
    } catch (err) {
      throw new ServiceUnavailableException(`Lecture de la feuille impossible : ${(err as Error).message}`);
    }
    const rows = matchSheetLines(lines, pupils, maxScore);
    return { class: klass.name, source: 'IMAGE', maxScore, rows: this.named(rows, pupils), ...this.summary(rows, pupils), saved: false };
  }
}

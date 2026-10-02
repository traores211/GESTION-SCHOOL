import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/current-user.decorator';
import { NameLookup, SlotLike, detectAllConflicts, hasBlockingConflict } from '../domain/conflicts';
import { Requirement, scheduleRequirements } from '../domain/scheduler';
import { TIME_PATTERN } from '../domain/time';
import { TimetableService, teacherDisplayName } from '../timetable.service';
import { DOCUMENT_AI, DocumentAiProvider } from './ai/document-ai';
import { KEY_BY_KIND, matchEntity, resolveEntities } from './entity-matcher';
import { Vocabulary, extractRows } from './extractors';
import { UnsupportedFileError, detectFileKind } from './file-type';
import { EntityDecisionDto, ImportCommitDto, ImportRowDto } from './import.dto';
import { stripAccents } from './normalize';
import { CsvParser } from './parsers/csv.parser';
import { DocxParser } from './parsers/docx.parser';
import { ImageParser } from './parsers/image.parser';
import { PdfParser } from './parsers/pdf.parser';
import { XlsxParser } from './parsers/xlsx.parser';
import { DocumentParser, DraftRow, EntityKind, ParsedDocument } from './types';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

type Ref = { existing: string } | { create: string } | null;

interface PlannedSession extends SlotLike {
  id: string;
  rowId: string | null;
  generated: boolean;
  subjectId: string | null;
  labels: { className: string; subject: string | null; teacher: string | null; room: string | null };
}

@Injectable()
export class TimetableImportService {
  private readonly logger = new Logger('TimetableImport');
  private readonly parsers: DocumentParser[] = [new CsvParser(), new XlsxParser(), new DocxParser(), new PdfParser(), new ImageParser()];

  constructor(
    private readonly prisma: PrismaService,
    private readonly timetable: TimetableService,
    @Inject(DOCUMENT_AI) private readonly ai: DocumentAiProvider,
  ) {}

  capabilities() {
    return {
      aiAvailable: this.ai.isAvailable(),
      aiProvider: this.ai.isAvailable() ? this.ai.name : null,
      maxBytes: MAX_IMPORT_BYTES,
      formats: [
        { kind: 'xlsx', label: 'Excel (.xlsx)', extensions: ['.xlsx'] },
        { kind: 'csv', label: 'CSV / texte', extensions: ['.csv', '.tsv', '.txt'] },
        { kind: 'pdf', label: 'PDF', extensions: ['.pdf'] },
        { kind: 'docx', label: 'Word (.docx)', extensions: ['.docx'] },
        { kind: 'image', label: 'Image (PNG, JPEG)', extensions: ['.png', '.jpg', '.jpeg', '.webp'] },
      ],
    };
  }

  // ---------------------------------------------------------------- 1. file → extraction → analysis

  async analyze(user: AuthUser, file: { buffer: Buffer; originalname: string; size: number } | undefined, useAi: boolean) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier reçu');
    if (file.size > MAX_IMPORT_BYTES) throw new PayloadTooLargeException('Fichier trop volumineux (10 Mo maximum)');
    const schoolId = this.timetable.requireSchool(user);
    const yearId = await this.timetable.resolveYearId(schoolId);
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8'); // multer decodes names as latin1

    let detected;
    try {
      detected = detectFileKind(file.buffer, fileName);
    } catch (err) {
      if (err instanceof UnsupportedFileError) throw new UnsupportedMediaTypeException(err.message);
      throw err;
    }
    const parser = this.parsers.find((p) => p.kinds.includes(detected.kind))!;
    let doc: ParsedDocument;
    try {
      doc = await parser.parse(file.buffer, detected);
    } catch (err) {
      this.logger.warn(`Parse failure (${detected.kind}) ${fileName}: ${(err as Error).message}`);
      throw new BadRequestException(`Impossible de lire ce fichier ${detected.label} : il est peut-être corrompu ou protégé par un mot de passe`);
    }

    const vocab = await this.vocabulary(schoolId, yearId);
    const warnings = [...doc.warnings];
    let { rows, method } = extractRows(doc, vocab);
    let aiUsed = false;
    if (useAi) {
      if (!this.ai.isAvailable()) {
        warnings.push("L'analyse IA n'est pas configurée sur ce serveur (ANTHROPIC_API_KEY) : résultat de l'analyse automatique locale.");
      } else {
        try {
          const aiRows = await this.ai.extract(doc, vocab, fileName);
          if (aiRows.length) {
            rows = aiRows;
            method = 'ai';
            aiUsed = true;
          } else warnings.push("L'IA n'a trouvé aucune séance dans ce document.");
        } catch (err) {
          this.logger.warn(`AI extraction failed: ${(err as Error).message}`);
          warnings.push(`Analyse IA indisponible : ${(err as Error).message}. Résultat de l'analyse locale conservé.`);
        }
      }
    }
    if (!rows.length) {
      warnings.push(
        "Aucune séance n'a été reconnue. Formats attendus : une ligne par séance (colonnes Jour, Horaire, Classe, Matière, Enseignant, Salle) ou une grille jours × horaires.",
      );
    }

    return {
      file: { name: fileName, size: file.size, kind: detected.kind, label: detected.label },
      method,
      aiAvailable: this.ai.isAvailable(),
      aiUsed,
      warnings,
      rows,
      entities: this.resolveAll(rows, vocab),
      stats: {
        rows: rows.length,
        withIssues: rows.filter((r) => r.issues.length).length,
        requirements: rows.filter((r) => r.hoursPerWeek !== null).length,
      },
    };
  }

  /** Re-runs name matching after the user edited rows in the preview. */
  async resolve(user: AuthUser, rows: ImportRowDto[]) {
    const schoolId = this.timetable.requireSchool(user);
    const vocab = await this.vocabulary(schoolId, await this.timetable.resolveYearId(schoolId));
    return { entities: this.resolveAll(rows, vocab) };
  }

  // ---------------------------------------------------------------- 2. validation → conflicts → generation (dry run)

  async preview(user: AuthUser, dto: ImportCommitDto) {
    const plan = await this.plan(user, dto);
    return this.summary(plan);
  }

  // ---------------------------------------------------------------- 3. write

  async commit(user: AuthUser, dto: ImportCommitDto) {
    const plan = await this.plan(user, dto);
    const summary = this.summary(plan);
    if (!plan.sessions.length) throw new BadRequestException("Aucune séance valide à créer : corrigez les lignes en erreur");
    if (summary.blockingConflicts > 0 && !dto.allowConflicts) {
      throw new ConflictException({
        message: `${summary.blockingConflicts} séance(s) en conflit. Corrigez-les ou confirmez l'import malgré les conflits.`,
        preview: summary,
      });
    }

    const { schoolId, yearId } = plan;
    const result = await this.prisma.$transaction(
      async (tx) => {
        const created = { class: new Map<string, string>(), subject: new Map<string, string>(), room: new Map<string, string>() };
        for (const raw of plan.toCreate.class) created.class.set(raw, await this.createClass(tx, schoolId, yearId, raw));
        for (const raw of plan.toCreate.subject) created.subject.set(raw, await this.createSubject(tx, schoolId, raw));
        for (const raw of plan.toCreate.room) {
          const room = await tx.room.upsert({
            where: { schoolId_name: { schoolId, name: raw } },
            update: {},
            create: { schoolId, name: raw },
          });
          created.room.set(raw, room.id);
        }
        const real = (id: string | null | undefined, kind: 'class' | 'subject' | 'room') => {
          if (!id) return null;
          const prefix = `new:${kind}:`;
          return id.startsWith(prefix) ? created[kind].get(id.slice(prefix.length)) ?? null : id;
        };

        let replaced = 0;
        if (plan.replaceIds.length) {
          replaced = (await tx.timetableSession.deleteMany({ where: { id: { in: plan.replaceIds }, schoolId } })).count;
        }
        const record = await tx.timetableImport.create({
          data: {
            schoolId,
            fileName: dto.fileName,
            fileType: dto.fileType,
            method: plan.sessions.some((s) => s.generated) ? `${dto.method}+requirements` : dto.method,
            createdById: user.userId,
            sessionCount: plan.sessions.length,
            conflictCount: summary.blockingConflicts,
          },
        });
        await tx.timetableSession.createMany({
          data: plan.sessions.map((s) => ({
            schoolId,
            academicYearId: yearId,
            termId: dto.termId || null,
            classId: real(s.classId, 'class')!,
            subjectId: real(s.subjectId, 'subject'),
            teacherId: s.teacherId ?? null,
            roomId: real(s.roomId, 'room'),
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            label: s.subjectId ? null : s.labels.subject,
            importId: record.id,
          })),
        });
        return { importId: record.id, replaced, classIds: [...new Set(plan.sessions.map((s) => real(s.classId, 'class')!))] };
      },
      { timeout: 30_000 },
    );

    this.logger.log(`Import ${result.importId}: ${plan.sessions.length} sessions, ${summary.blockingConflicts} conflicts, ${result.replaced} replaced`);
    return {
      ...result,
      created: plan.sessions.length,
      conflictCount: summary.blockingConflicts,
      unplaced: summary.unplaced.length,
      skippedRows: summary.rowErrors.length,
    };
  }

  // ---------------------------------------------------------------- planning

  private async plan(user: AuthUser, dto: ImportCommitDto) {
    const schoolId = this.timetable.requireSchool(user);
    const yearId = await this.timetable.resolveYearId(schoolId);
    if (dto.termId) {
      const term = await this.prisma.term.findFirst({ where: { id: dto.termId, academicYearId: yearId } });
      if (!term) throw new BadRequestException('Période introuvable pour l’année scolaire courante');
    }
    const [vocab, settings, baseNames, existing] = await Promise.all([
      this.vocabulary(schoolId, yearId),
      this.timetable.loadSettings(schoolId),
      this.timetable.nameLookup(schoolId),
      this.prisma.timetableSession.findMany({
        where: { schoolId, academicYearId: yearId },
        select: { id: true, classId: true, teacherId: true, roomId: true, termId: true, dayOfWeek: true, startTime: true, endTime: true },
      }),
    ]);
    const refs = this.decisionResolver(dto.entities, vocab);

    const rowErrors: { rowId: string; message: string }[] = [];
    const placed: PlannedSession[] = [];
    const requirements: (Requirement & { labels: PlannedSession['labels']; subjectId: string | null; rowId: string })[] = [];
    const toCreate = { class: new Set<string>(), subject: new Set<string>(), room: new Set<string>() };
    const idOf = (kind: 'class' | 'subject' | 'room', ref: Ref) => {
      if (!ref) return null;
      if ('existing' in ref) return ref.existing;
      toCreate[kind].add(ref.create);
      return `new:${kind}:${ref.create}`;
    };

    for (const row of dto.rows) {
      const errors: string[] = [];
      const classRef = row.className ? refs('class', row.className) : null;
      if (!row.className) errors.push('Classe manquante');
      else if (!classRef) errors.push(`Classe « ${row.className} » non associée à une classe de l'établissement`);
      const subjectRef = row.subjectName ? refs('subject', row.subjectName) : null;
      const teacherRef = row.teacherName ? refs('teacher', row.teacherName) : null;
      const roomRef = row.roomName ? refs('room', row.roomName) : null;

      const isRequirement = !!row.hoursPerWeek && !row.dayOfWeek && !row.startTime;
      if (!isRequirement) {
        if (!row.dayOfWeek) errors.push('Jour manquant');
        if (!row.startTime || !row.endTime || !TIME_PATTERN.test(row.startTime) || !TIME_PATTERN.test(row.endTime)) errors.push('Horaire manquant');
        else if (row.startTime >= row.endTime) errors.push("L'heure de fin doit être après l'heure de début");
      }
      if (errors.length) {
        rowErrors.push({ rowId: row.id, message: errors.join(' · ') });
        continue;
      }
      const labels = {
        className: row.className!.trim(),
        subject: row.subjectName?.trim() || null,
        teacher: teacherRef && 'existing' in teacherRef ? vocab.teachers.find((t) => t.id === teacherRef.existing)?.name ?? row.teacherName! : null,
        room: row.roomName?.trim() || null,
      };
      const base = {
        classId: idOf('class', classRef)!,
        subjectId: idOf('subject', subjectRef),
        teacherId: teacherRef && 'existing' in teacherRef ? teacherRef.existing : null,
        roomId: idOf('room', roomRef),
        termId: dto.termId || null,
      };
      if (isRequirement) {
        requirements.push({ ...base, key: row.id, rowId: row.id, minutesPerWeek: Math.round(row.hoursPerWeek! * 60), labels });
      } else {
        placed.push({
          ...base,
          id: `row:${row.id}`,
          rowId: row.id,
          generated: false,
          dayOfWeek: row.dayOfWeek!,
          startTime: row.startTime!,
          endTime: row.endTime!,
          labels,
        });
      }
    }

    // Replace mode: the imported classes' sessions for the same period are dropped first.
    const importedClassIds = new Set([...placed, ...requirements].map((s) => s.classId).filter((id) => !id.startsWith('new:')));
    const replaceIds =
      dto.mode === 'replace'
        ? existing.filter((s) => importedClassIds.has(s.classId) && (s.termId ?? null) === (dto.termId || null)).map((s) => s.id)
        : [];
    const kept = existing.filter((s) => !replaceIds.includes(s.id));

    const { placed: generatedSlots, unplaced } = scheduleRequirements(requirements, [...kept, ...placed], settings);
    const reqByKey = new Map(requirements.map((r) => [r.key, r]));
    const generated: PlannedSession[] = generatedSlots.map((g, i) => {
      const req = reqByKey.get(g.requirementKey)!;
      return { ...g, id: `gen:${i + 1}`, rowId: req.rowId, generated: true, subjectId: req.subjectId, labels: req.labels };
    });

    const sessions = [...placed, ...generated];
    const newLabels = new Map(sessions.map((s) => [s.classId, s.labels.className]));
    const roomLabels = new Map(sessions.filter((s) => s.roomId).map((s) => [s.roomId!, s.labels.room ?? '']));
    const names: NameLookup = {
      className: (id) => (id.startsWith('new:') ? newLabels.get(id) ?? id.slice(10) : baseNames.className(id)),
      teacherName: (id) => baseNames.teacherName(id),
      roomName: (id) => (id.startsWith('new:') ? roomLabels.get(id) ?? id.slice(9) : baseNames.roomName(id)),
    };
    const conflicts = detectAllConflicts([...kept, ...sessions], names, settings);

    return {
      schoolId,
      yearId,
      settings,
      sessions: sessions.map((s) => ({ ...s, conflicts: conflicts.get(s.id) ?? [] })),
      unplaced: unplaced.map((u) => {
        const req = reqByKey.get(u.requirementKey)!;
        return { rowId: req.rowId, minutes: u.minutes, reason: u.reason, labels: req.labels };
      }),
      rowErrors,
      replaceIds,
      toCreate: { class: [...toCreate.class], subject: [...toCreate.subject], room: [...toCreate.room] },
    };
  }

  private summary(plan: Awaited<ReturnType<TimetableImportService['plan']>>) {
    const blocking = plan.sessions.filter((s) => hasBlockingConflict(s.conflicts)).length;
    return {
      sessions: plan.sessions.map((s) => ({
        key: s.id,
        rowId: s.rowId,
        generated: s.generated,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        className: s.labels.className,
        subject: s.labels.subject,
        teacher: s.labels.teacher,
        room: s.labels.room,
        conflicts: s.conflicts,
      })),
      unplaced: plan.unplaced,
      rowErrors: plan.rowErrors,
      toCreate: plan.toCreate,
      replaceCount: plan.replaceIds.length,
      blockingConflicts: blocking,
      warnings: plan.sessions.filter((s) => s.conflicts.length && !hasBlockingConflict(s.conflicts)).length,
      generatedCount: plan.sessions.filter((s) => s.generated).length,
    };
  }

  // ---------------------------------------------------------------- helpers

  async vocabulary(schoolId: string, yearId: string): Promise<Vocabulary> {
    const [classes, subjects, teachers, rooms] = await Promise.all([
      this.prisma.class.findMany({ where: { schoolId, academicYearId: yearId }, select: { id: true, name: true, code: true } }),
      this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, name: true, code: true } }),
      this.prisma.staffMember.findMany({ where: { user: { schoolId } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } }),
      this.prisma.room.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    ]);
    return {
      classes: classes.map((c) => ({ id: c.id, name: c.name, aliases: [c.code] })),
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, aliases: [s.code] })),
      teachers: teachers.map((t) => ({ id: t.id, name: teacherDisplayName(t.user), aliases: [t.user.lastName] })),
      rooms: rooms.map((r) => ({ id: r.id, name: r.name })),
    };
  }

  private resolveAll(rows: Partial<Pick<DraftRow, 'className' | 'subjectName' | 'teacherName' | 'roomName'>>[], vocab: Vocabulary) {
    return [
      ...resolveEntities('class', rows.map((r) => r.className ?? null), vocab.classes),
      ...resolveEntities('subject', rows.map((r) => r.subjectName ?? null), vocab.subjects),
      ...resolveEntities('teacher', rows.map((r) => r.teacherName ?? null), vocab.teachers),
      ...resolveEntities('room', rows.map((r) => r.roomName ?? null), vocab.rooms),
    ];
  }

  /**
   * Turns the user's decisions into references. Names without a decision (edited in the preview) are
   * only accepted on an exact match; anything else stays unresolved rather than guessed.
   */
  private decisionResolver(decisions: EntityDecisionDto[], vocab: Vocabulary) {
    const byKey = new Map(decisions.map((d) => [`${d.kind}:${d.raw.trim()}`, d]));
    const lists: Record<EntityKind, { id: string; name: string; aliases?: string[] }[]> = {
      class: vocab.classes,
      subject: vocab.subjects,
      teacher: vocab.teachers,
      room: vocab.rooms,
    };
    const createKeys = new Map<string, string>(); // one creation per normalized name
    return (kind: EntityKind, raw: string): Ref => {
      const name = raw.trim();
      const decision = byKey.get(`${kind}:${name}`);
      if (decision) {
        if (decision.action === 'ignore') return null;
        if (decision.action === 'match') {
          if (!decision.id || !lists[kind].some((e) => e.id === decision.id)) {
            throw new BadRequestException(`Choisissez une correspondance valide pour « ${name} »`);
          }
          return { existing: decision.id };
        }
        if (kind === 'teacher') throw new BadRequestException(`Les enseignants ne peuvent pas être créés par import (« ${name} »)`);
        const key = `${kind}:${KEY_BY_KIND[kind](name)}`;
        if (!createKeys.has(key)) createKeys.set(key, name);
        return { create: createKeys.get(key)! };
      }
      const m = matchEntity(kind, name, lists[kind]);
      return m.status === 'exact' && m.id ? { existing: m.id } : null;
    };
  }

  private async createClass(tx: Prisma.TransactionClient, schoolId: string, yearId: string, name: string) {
    const level = name.match(/^(\d{1,2}\s*(?:e|è|ème|eme)|1\s*(?:re|ère)|2nde|seconde|terminale|tle|C[PEM]\s*\d?)/i)?.[1] ?? name;
    const base = stripAccents(name).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || 'CLASSE';
    let code = base;
    for (let i = 2; await tx.class.findFirst({ where: { academicYearId: yearId, code } }); i++) code = `${base}-${i}`;
    const klass = await tx.class.create({ data: { schoolId, academicYearId: yearId, name, code, level: level.trim() } });
    return klass.id;
  }

  private async createSubject(tx: Prisma.TransactionClient, schoolId: string, name: string) {
    const base = stripAccents(name).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'MAT';
    let code = base;
    for (let i = 2; await tx.subject.findFirst({ where: { schoolId, code } }); i++) code = `${base}${i}`;
    const subject = await tx.subject.create({ data: { schoolId, name, code } });
    return subject.id;
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { inSchool } from '../platform/group.service';
import { AuthUser } from '../common/current-user.decorator';
import {
  Conflict,
  GridSettings,
  NameLookup,
  SlotLike,
  detectAllConflicts,
  findConflicts,
  hasBlockingConflict,
  validateSlot,
} from './domain/conflicts';
import { TIME_PATTERN, formatSlot, fromMinutes, parseRanges, toMinutes } from './domain/time';
import { YearGrid, formatHalfDays, hourUnit } from './domain/grid';
import { LessonReport, checkLesson, failureMessages } from './domain/rules';
import { PlanningDataService, SessionSnapshot } from './planning/planning-data.service';
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

export const SESSION_INCLUDE = {
  class: { select: { id: true, name: true, level: true } },
  subject: { select: { id: true, name: true, code: true, color: true } },
  teacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
  room: { select: { id: true, name: true } },
  term: { select: { id: true, name: true } },
} satisfies Prisma.TimetableSessionInclude;

type SessionWithRefs = Prisma.TimetableSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

export type TimetableSettings = GridSettings & {
  slotMinutes: number;
  freeHalfDays: string;
  halfDaySplit: string;
  maxClassHoursPerDay: number | null;
  maxTeacherHoursPerDay: number | null;
};

export function teacherDisplayName(user: { firstName: string; lastName: string }) {
  return `${user.firstName} ${user.lastName}`.trim();
}

/** Grid as sent to the editor: the year settings, with daily maximums in official hours. */
export function presentGrid(grid: YearGrid): TimetableSettings {
  const unit = hourUnit(grid);
  return {
    days: grid.days,
    start: grid.start,
    end: grid.end,
    breaks: grid.breaks,
    slotMinutes: grid.slotMinutes,
    freeHalfDays: formatHalfDays(grid.freeHalfDays),
    halfDaySplit: grid.halfDaySplit,
    maxClassHoursPerDay: grid.maxClassMinutesPerDay == null ? null : grid.maxClassMinutesPerDay / unit,
    maxTeacherHoursPerDay: grid.maxTeacherMinutesPerDay == null ? null : grid.maxTeacherMinutesPerDay / unit,
  };
}

/** Lesson refused by the rules: 409 with every check, so the form can show ✅/❌. */
export function refuse(report: LessonReport, prefix = 'Cours refusé') {
  throw new ConflictException({ message: `${prefix} : ${failureMessages(report).join(' · ')}`, checks: report.checks, warnings: report.warnings, conflicts: [] });
}

/** Session fields kept in the history, enough to recreate it on undo. */
export function snapshot(s: SessionSnapshot | SessionWithRefs): SessionSnapshot {
  return {
    id: s.id,
    classId: s.classId,
    subjectId: s.subjectId,
    teacherId: s.teacherId,
    roomId: s.roomId,
    termId: s.termId,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    label: s.label,
    notes: s.notes,
    locked: s.locked,
    importId: s.importId,
  };
}

/** "Mathématiques · 6e A · Lundi 08:00–10:00" for the history. */
export function describe(s: SessionWithRefs) {
  return [s.subject?.name ?? s.label ?? 'Séance', s.class?.name, formatSlot(s.dayOfWeek, s.startTime, s.endTime)].filter(Boolean).join(' · ');
}

export function describeChange(before: SessionWithRefs, after: SessionWithRefs) {
  const parts: string[] = [];
  if (before.dayOfWeek !== after.dayOfWeek || before.startTime !== after.startTime || before.endTime !== after.endTime) {
    parts.push(formatSlot(after.dayOfWeek, after.startTime, after.endTime));
  }
  if (before.teacherId !== after.teacherId) parts.push(`professeur : ${after.teacher ? teacherDisplayName(after.teacher.user) : 'aucun'}`);
  if (before.roomId !== after.roomId) parts.push(`salle : ${after.room?.name ?? 'aucune'}`);
  if (before.subjectId !== after.subjectId) parts.push(`matière : ${after.subject?.name ?? 'aucune'}`);
  if (before.classId !== after.classId) parts.push(`classe : ${after.class?.name}`);
  return parts.join(', ') || 'détails';
}

@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PlanningDataService,
  ) {}

  // ---------------------------------------------------------------- context

  requireSchool(user: AuthUser): string {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  async resolveYearId(schoolId: string, academicYearId?: string): Promise<string> {
    if (academicYearId) {
      const year = await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId }, select: { id: true } });
      if (!year) throw new NotFoundException('Année scolaire introuvable');
      return year.id;
    }
    const current = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } });
    if (!current) throw new BadRequestException("Aucune année scolaire courante n'est configurée pour cet établissement");
    return current.id;
  }

  /** Grid of the given year (current year by default). */
  async loadSettings(schoolId: string, academicYearId?: string): Promise<TimetableSettings> {
    return presentGrid(await this.loadGrid(schoolId, academicYearId));
  }

  async loadGrid(schoolId: string, academicYearId?: string): Promise<YearGrid> {
    const yearId = academicYearId ?? (await this.resolveYearId(schoolId));
    return this.planning.loadGrid(schoolId, yearId);
  }

  /** Display names for conflict messages, for every class/teacher/room of the school. */
  async nameLookup(schoolId: string): Promise<NameLookup> {
    const [classes, teachers, rooms] = await Promise.all([
      this.prisma.class.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      this.prisma.staffMember.findMany({ where: { user: { schoolId } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } }),
      this.prisma.room.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    ]);
    const c = new Map(classes.map((x) => [x.id, x.name]));
    const t = new Map(teachers.map((x) => [x.id, teacherDisplayName(x.user)]));
    const r = new Map(rooms.map((x) => [x.id, x.name]));
    return {
      className: (id) => c.get(id) ?? 'Classe inconnue',
      teacherName: (id) => t.get(id) ?? 'Enseignant inconnu',
      roomName: (id) => r.get(id) ?? 'Salle inconnue',
    };
  }

  private async yearSlots(schoolId: string, academicYearId: string): Promise<SlotLike[]> {
    return this.prisma.timetableSession.findMany({
      where: { schoolId, academicYearId },
      select: { id: true, classId: true, teacherId: true, roomId: true, termId: true, dayOfWeek: true, startTime: true, endTime: true },
    });
  }

  // ---------------------------------------------------------------- settings & resources

  async getSettings(user: AuthUser, academicYearId?: string) {
    const schoolId = this.requireSchool(user);
    return this.loadSettings(schoolId, await this.resolveYearId(schoolId, academicYearId));
  }

  /** Saves the grid of one academic year (the current year by default). */
  async updateSettings(user: AuthUser, dto: TimetableSettingsDto) {
    const schoolId = this.requireSchool(user);
    const yearId = await this.resolveYearId(schoolId, dto.academicYearId);
    const current = await this.planning.loadGrid(schoolId, yearId);
    const start = dto.start ?? current.start;
    const end = dto.end ?? current.end;
    const split = dto.halfDaySplit ?? current.halfDaySplit;
    const slot = dto.slotMinutes ?? current.slotMinutes;
    if (start >= end) throw new BadRequestException("L'heure de fin de journée doit être après l'heure de début");
    if (split <= start || split >= end) throw new BadRequestException(`La limite matin / après-midi doit être entre ${start} et ${end}`);
    if (dto.days && dto.days.length === 0) throw new BadRequestException('Sélectionnez au moins un jour de cours');
    const breaks = dto.breaks !== undefined ? parseRanges(dto.breaks) : current.breaks;
    const outside = breaks.find((b) => b.start < start || b.end > end);
    if (outside) throw new BadRequestException(`La pause ${outside.start}–${outside.end} sort de la journée de cours`);
    const unit = slot >= 45 && slot <= 60 ? slot : 60;
    const toMin = (hours: number | null | undefined, fallback: number | null) => (hours === undefined ? fallback : hours === null ? null : Math.round(hours * unit));
    const data = {
      days: [...new Set(dto.days ?? current.days)].sort((a, b) => a - b).join(','),
      start,
      end,
      slotMinutes: slot,
      breaks: breaks.map((b) => `${b.start}-${b.end}`).join(','),
      freeHalfDays: dto.freeHalfDays !== undefined ? formatHalfDays(dto.freeHalfDays) : formatHalfDays(current.freeHalfDays),
      halfDaySplit: split,
      maxClassMinutesPerDay: toMin(dto.maxClassHoursPerDay, current.maxClassMinutesPerDay),
      maxTeacherMinutesPerDay: toMin(dto.maxTeacherHoursPerDay, current.maxTeacherMinutesPerDay),
    };
    await this.prisma.timetableGrid.upsert({ where: { academicYearId: yearId }, update: data, create: { ...data, academicYearId: yearId } });
    return this.loadSettings(schoolId, yearId);
  }

  /** Everything the editor needs in one call: classes, subjects, teachers, rooms, terms, settings. */
  async resources(user: AuthUser, academicYearId?: string) {
    const schoolId = this.requireSchool(user);
    const yearId = await this.resolveYearId(schoolId, academicYearId);
    const [year, classes, subjects, teachers, rooms, terms, settings, me] = await Promise.all([
      this.prisma.academicYear.findUniqueOrThrow({ where: { id: yearId }, select: { id: true, name: true } }),
      this.prisma.class.findMany({
        where: { schoolId, academicYearId: yearId },
        select: { id: true, name: true, level: true, _count: { select: { enrollments: { where: { withdrawalDate: null } } } } },
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, name: true, code: true, color: true }, orderBy: { name: 'asc' } }),
      this.prisma.staffMember.findMany({
        where: { user: { ...inSchool(schoolId), role: { in: ['ENSEIGNANT', 'DIRECTOR'] } } },
        select: { id: true, position: true, matricule: true, weeklyMaxMinutes: true, user: { select: { firstName: true, lastName: true, role: true } } },
        orderBy: { user: { lastName: 'asc' } },
      }),
      this.prisma.room.findMany({ where: { schoolId }, include: { subjects: { select: { id: true } } }, orderBy: { name: 'asc' } }),
      this.prisma.term.findMany({ where: { academicYearId: yearId }, select: { id: true, name: true, order: true }, orderBy: { order: 'asc' } }),
      this.loadSettings(schoolId, yearId),
      this.prisma.staffMember.findUnique({ where: { userId: user.userId }, select: { id: true } }),
    ]);
    // Planning data, so the lesson form can filter its lists and pre-check rules client side.
    const data = await this.planning.loadData(schoolId, yearId);
    return {
      academicYear: year,
      classes: classes.map(({ _count, ...c }) => ({ ...c, studentCount: _count.enrollments })),
      subjects,
      teachers: teachers.map((t) => ({ id: t.id, name: teacherDisplayName(t.user), position: t.position, matricule: t.matricule, weeklyMaxMinutes: t.weeklyMaxMinutes })),
      rooms: rooms.map(({ subjects: linked, ...r }) => ({ ...r, subjectIds: linked.map((s) => s.id) })),
      terms,
      settings,
      planning: {
        qualifications: data.qualifications,
        availability: Object.fromEntries(data.availability),
        volumes: [...data.volumes.entries()].map(([key, v]) => {
          const [level, subjectId] = key.split('|');
          return { level, subjectId, ...v };
        }),
      },
      me: { role: user.role, teacherId: me?.id ?? null },
    };
  }

  // ---------------------------------------------------------------- sessions

  async list(user: AuthUser, query: TimetableQueryDto) {
    const schoolId = this.requireSchool(user);
    const academicYearId = await this.resolveYearId(schoolId, query.academicYearId);
    const [all, names, settings] = await Promise.all([
      this.prisma.timetableSession.findMany({
        where: { schoolId, academicYearId },
        include: SESSION_INCLUDE,
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.nameLookup(schoolId),
      this.loadSettings(schoolId, academicYearId),
    ]);
    // Conflicts are computed on the whole year, then the requested view is filtered.
    const conflicts = detectAllConflicts(all, names, settings);
    const visible = all.filter(
      (s) =>
        (!query.classId || s.classId === query.classId) &&
        (!query.teacherId || s.teacherId === query.teacherId) &&
        (!query.roomId || s.roomId === query.roomId) &&
        (!query.termId || !s.termId || s.termId === query.termId),
    );
    const sessions = visible.map((s) => this.present(s, conflicts.get(s.id) ?? []));
    return {
      academicYearId,
      sessions,
      conflictCount: sessions.filter((s) => hasBlockingConflict(s.conflicts)).length,
    };
  }

  /** Every session with at least one conflict, for the "Conflits" panel. */
  async conflicts(user: AuthUser, query: TimetableQueryDto) {
    const { sessions, academicYearId } = await this.list(user, { academicYearId: query.academicYearId });
    const withIssues = sessions.filter((s) => s.conflicts.length > 0);
    return {
      academicYearId,
      errors: withIssues.filter((s) => hasBlockingConflict(s.conflicts)).length,
      warnings: withIssues.filter((s) => !hasBlockingConflict(s.conflicts)).length,
      sessions: withIssues,
    };
  }

  /** Every rule for a lesson, without saving it (lesson form, drag preview). */
  async check(user: AuthUser, dto: CheckSlotDto) {
    const schoolId = this.requireSchool(user);
    const klass = await this.assertRefs(schoolId, dto);
    const [report, conflicts] = await Promise.all([
      this.report(schoolId, klass.academicYearId, { ...dto, id: dto.id }),
      this.conflictsFor(schoolId, klass.academicYearId, { ...dto, id: dto.id }),
    ]);
    return { ...report, conflicts };
  }

  /** The shared rules applied to one lesson against the current timetable of its year. */
  async report(schoolId: string, academicYearId: string, lesson: SessionDto & { id?: string }): Promise<LessonReport> {
    const [data, lessons] = await Promise.all([this.planning.loadData(schoolId, academicYearId), this.planning.yearLessons(schoolId, academicYearId)]);
    return checkLesson(lesson, data, lessons);
  }

  async create(user: AuthUser, dto: SessionDto) {
    const schoolId = this.requireSchool(user);
    const klass = await this.assertRefs(schoolId, dto);
    const report = await this.report(schoolId, klass.academicYearId, dto);
    if (!report.ok) refuse(report, 'Cours refusé');
    const batch = this.planning.newBatch();
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.timetableSession.create({ data: { ...this.data(dto), schoolId, academicYearId: klass.academicYearId }, include: SESSION_INCLUDE });
      await this.planning.record(tx, user, schoolId, klass.academicYearId, batch, [
        { action: 'CREATE', sessionId: row.id, after: snapshot(row), summary: `Ajout : ${describe(row)}` },
      ]);
      return row;
    });
    return { ...this.present(created, []), warnings: report.warnings };
  }

  async update(user: AuthUser, id: string, dto: UpdateSessionDto) {
    const schoolId = this.requireSchool(user);
    const existing = await this.findOwned(schoolId, id);
    const merged: SessionDto = {
      classId: dto.classId ?? existing.classId,
      subjectId: dto.subjectId !== undefined ? dto.subjectId : existing.subjectId,
      teacherId: dto.teacherId !== undefined ? dto.teacherId : existing.teacherId,
      roomId: dto.roomId !== undefined ? dto.roomId : existing.roomId,
      termId: dto.termId !== undefined ? dto.termId : existing.termId,
      dayOfWeek: dto.dayOfWeek ?? existing.dayOfWeek,
      startTime: dto.startTime ?? existing.startTime,
      endTime: dto.endTime ?? existing.endTime,
      label: dto.label !== undefined ? dto.label : existing.label,
      notes: dto.notes !== undefined ? dto.notes : existing.notes,
    };
    const klass = await this.assertRefs(schoolId, merged);
    // Renaming or annotating a lesson does not move it: the rules are only applied when its slot,
    // class, subject, teacher, room or term changes (an imported lesson may already break one).
    const SCHEDULING = ['classId', 'subjectId', 'teacherId', 'roomId', 'termId', 'dayOfWeek', 'startTime', 'endTime'] as const;
    const rescheduled = SCHEDULING.some((key) => merged[key] !== existing[key]);
    const report = rescheduled ? await this.report(schoolId, klass.academicYearId, { ...merged, id }) : null;
    if (report && !report.ok) refuse(report, 'Modification refusée');
    const batch = this.planning.newBatch();
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.timetableSession.findUniqueOrThrow({ where: { id }, include: SESSION_INCLUDE });
      const row = await tx.timetableSession.update({ where: { id }, data: { ...this.data(merged), academicYearId: klass.academicYearId }, include: SESSION_INCLUDE });
      await this.planning.record(tx, user, schoolId, klass.academicYearId, batch, [
        { action: 'UPDATE', sessionId: id, before: snapshot(before), after: snapshot(row), summary: `Modification : ${describe(before)} → ${describeChange(before, row)}` },
      ]);
      return row;
    });
    return { ...this.present(updated, []), warnings: report?.warnings ?? [] };
  }

  /**
   * Copies a session. Without a target it looks for the same hours on the following open days and
   * takes the first one free of blocking conflicts.
   */
  async duplicate(user: AuthUser, id: string, dto: DuplicateSessionDto) {
    const schoolId = this.requireSchool(user);
    const source = await this.findOwned(schoolId, id);
    const duration = toMinutes(source.endTime) - toMinutes(source.startTime);
    const base: SessionDto = {
      classId: dto.classId ?? source.classId,
      subjectId: source.subjectId,
      teacherId: source.teacherId,
      roomId: source.roomId,
      termId: source.termId,
      dayOfWeek: source.dayOfWeek,
      startTime: source.startTime,
      endTime: source.endTime,
      label: source.label,
      notes: source.notes,
    };
    if (dto.startTime) {
      const end = toMinutes(dto.startTime) + duration;
      if (end > 24 * 60 - 1) throw new BadRequestException('La copie dépasserait minuit');
      base.startTime = dto.startTime;
      base.endTime = fromMinutes(end);
    }
    if (dto.dayOfWeek || dto.startTime || dto.classId) {
      if (dto.dayOfWeek) base.dayOfWeek = dto.dayOfWeek;
      return this.create(user, base);
    }

    const [data, lessons] = await Promise.all([
      this.planning.loadData(schoolId, source.academicYearId),
      this.planning.yearLessons(schoolId, source.academicYearId),
    ]);
    const days = data.grid.days.length ? data.grid.days : [1, 2, 3, 4, 5, 6];
    const ordered = [...days.filter((d) => d > source.dayOfWeek), ...days.filter((d) => d < source.dayOfWeek)];
    for (const day of ordered) {
      const candidate = { ...base, dayOfWeek: day };
      if (checkLesson(candidate, data, lessons).ok) return this.create(user, candidate);
    }
    throw new ConflictException({
      message: `Aucun autre jour ne permet de copier ce cours de ${source.startTime} à ${source.endTime} sans enfreindre une règle (classe, professeur, salle ou volume horaire)`,
      conflicts: [],
    });
  }

  async remove(user: AuthUser, id: string) {
    const schoolId = this.requireSchool(user);
    const existing = await this.findOwned(schoolId, id);
    const batch = this.planning.newBatch();
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.timetableSession.findUniqueOrThrow({ where: { id }, include: SESSION_INCLUDE });
      await tx.timetableSession.delete({ where: { id } });
      await this.planning.record(tx, user, schoolId, existing.academicYearId, batch, [
        { action: 'DELETE', sessionId: id, before: snapshot(before), summary: `Suppression : ${describe(before)}` },
      ]);
    });
    return { success: true };
  }

  // ---------------------------------------------------------------- rooms

  async listRooms(user: AuthUser) {
    const schoolId = this.requireSchool(user);
    const rooms = await this.prisma.room.findMany({
      where: { schoolId },
      include: { _count: { select: { sessions: true } }, subjects: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return rooms.map((r) => ({ ...r, subjectIds: r.subjects.map((s) => s.id) }));
  }

  async createRoom(user: AuthUser, dto: RoomDto) {
    const schoolId = this.requireSchool(user);
    const { subjectIds, ...rest } = dto;
    const subjects = await this.roomSubjects(schoolId, subjectIds);
    return this.prisma.room.create({ data: { ...rest, name: dto.name.trim(), schoolId, ...(subjects ? { subjects: { connect: subjects } } : {}) } });
  }

  async updateRoom(user: AuthUser, id: string, dto: UpdateRoomDto) {
    const schoolId = this.requireSchool(user);
    await this.findOwnedRoom(schoolId, id);
    const { subjectIds, ...rest } = dto;
    const subjects = await this.roomSubjects(schoolId, subjectIds);
    return this.prisma.room.update({
      where: { id },
      data: { ...rest, ...(dto.name ? { name: dto.name.trim() } : {}), ...(subjects ? { subjects: { set: subjects } } : {}) },
    });
  }

  /** Validates the subjects of a specialised room (undefined = leave unchanged). */
  private async roomSubjects(schoolId: string, ids: string[] | undefined) {
    if (ids === undefined) return undefined;
    const unique = [...new Set(ids)];
    const found = await this.prisma.subject.count({ where: { schoolId, id: { in: unique } } });
    if (found !== unique.length) throw new NotFoundException('Matière introuvable');
    return unique.map((id) => ({ id }));
  }

  async removeRoom(user: AuthUser, id: string) {
    const schoolId = this.requireSchool(user);
    await this.findOwnedRoom(schoolId, id);
    await this.prisma.room.delete({ where: { id } });
    return { success: true };
  }

  // ---------------------------------------------------------------- imports history

  listImports(user: AuthUser) {
    const schoolId = this.requireSchool(user);
    return this.prisma.timetableImport.findMany({
      where: { schoolId },
      include: { _count: { select: { sessions: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  /** Undo an import: removes the sessions it created (entities created with it are kept). */
  async undoImport(user: AuthUser, id: string) {
    const schoolId = this.requireSchool(user);
    const found = await this.prisma.timetableImport.findFirst({ where: { id, schoolId } });
    if (!found) throw new NotFoundException('Import introuvable');
    const [deleted] = await this.prisma.$transaction([
      this.prisma.timetableSession.deleteMany({ where: { importId: id, schoolId } }),
      this.prisma.timetableImport.delete({ where: { id } }),
    ]);
    return { success: true, deletedSessions: deleted.count };
  }

  // ---------------------------------------------------------------- helpers

  present(session: SessionWithRefs, conflicts: Conflict[]) {
    const { teacher, ...rest } = session;
    return {
      ...rest,
      teacher: teacher ? { id: teacher.id, name: teacherDisplayName(teacher.user) } : null,
      conflicts,
    };
  }

  async conflictsFor(schoolId: string, academicYearId: string, slot: SlotLike): Promise<Conflict[]> {
    const [others, names, settings] = await Promise.all([
      this.yearSlots(schoolId, academicYearId),
      this.nameLookup(schoolId),
      this.loadSettings(schoolId, academicYearId),
    ]);
    return [...validateSlot(slot, settings), ...findConflicts(slot, others, names)];
  }

  private data(dto: SessionDto) {
    return {
      classId: dto.classId,
      subjectId: dto.subjectId || null,
      teacherId: dto.teacherId || null,
      roomId: dto.roomId || null,
      termId: dto.termId || null,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      label: dto.label?.trim() || null,
      notes: dto.notes?.trim() || null,
    };
  }

  private async findOwned(schoolId: string, id: string) {
    const found = await this.prisma.timetableSession.findFirst({ where: { id, schoolId } });
    if (!found) throw new NotFoundException('Séance introuvable');
    return found;
  }

  private async findOwnedRoom(schoolId: string, id: string) {
    const found = await this.prisma.room.findFirst({ where: { id, schoolId } });
    if (!found) throw new NotFoundException('Salle introuvable');
    return found;
  }

  /** Every referenced entity must belong to the user's school (and the term to the class's year). */
  private async assertRefs(schoolId: string, dto: SessionDto) {
    if (!TIME_PATTERN.test(dto.startTime) || !TIME_PATTERN.test(dto.endTime)) {
      throw new BadRequestException('Horaire attendu au format HH:MM');
    }
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException(`Créneau invalide : ${formatSlot(dto.dayOfWeek, dto.startTime, dto.endTime)}`);
    }
    const klass = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId }, select: { id: true, academicYearId: true } });
    if (!klass) throw new NotFoundException('Classe introuvable');
    const checks: Promise<unknown>[] = [];
    if (dto.subjectId) {
      checks.push(this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId } }).then((x) => x || Promise.reject(new NotFoundException('Matière introuvable'))));
    }
    if (dto.teacherId) {
      checks.push(
        this.prisma.staffMember
          .findFirst({ where: { id: dto.teacherId, user: { schoolId } } })
          .then((x) => x || Promise.reject(new NotFoundException('Enseignant introuvable'))),
      );
    }
    if (dto.roomId) {
      checks.push(this.prisma.room.findFirst({ where: { id: dto.roomId, schoolId } }).then((x) => x || Promise.reject(new NotFoundException('Salle introuvable'))));
    }
    if (dto.termId) {
      checks.push(
        this.prisma.term
          .findFirst({ where: { id: dto.termId, academicYearId: klass.academicYearId } })
          .then((x) => x || Promise.reject(new NotFoundException('Période introuvable pour cette année scolaire'))),
      );
    }
    await Promise.all(checks);
    return klass;
  }
}

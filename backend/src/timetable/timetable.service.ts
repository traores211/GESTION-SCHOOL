import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
import { TIME_PATTERN, formatSlot, fromMinutes, parseDays, parseRanges, toMinutes } from './domain/time';
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

export type TimetableSettings = GridSettings & { slotMinutes: number };

export function teacherDisplayName(user: { firstName: string; lastName: string }) {
  return `${user.firstName} ${user.lastName}`.trim();
}

@Injectable()
export class TimetableService {
  constructor(private readonly prisma: PrismaService) {}

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

  async loadSettings(schoolId: string): Promise<TimetableSettings> {
    const school = await this.prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { timetableDays: true, timetableStart: true, timetableEnd: true, timetableBreaks: true, timetableSlotMinutes: true },
    });
    return {
      days: parseDays(school.timetableDays),
      start: school.timetableStart,
      end: school.timetableEnd,
      breaks: parseRanges(school.timetableBreaks),
      slotMinutes: school.timetableSlotMinutes,
    };
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

  async getSettings(user: AuthUser) {
    return this.loadSettings(this.requireSchool(user));
  }

  async updateSettings(user: AuthUser, dto: TimetableSettingsDto) {
    const schoolId = this.requireSchool(user);
    const current = await this.loadSettings(schoolId);
    const start = dto.start ?? current.start;
    const end = dto.end ?? current.end;
    if (start >= end) throw new BadRequestException("L'heure de fin de journée doit être après l'heure de début");
    if (dto.days && dto.days.length === 0) throw new BadRequestException('Sélectionnez au moins un jour de cours');
    await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        ...(dto.days ? { timetableDays: [...new Set(dto.days)].sort().join(',') } : {}),
        timetableStart: start,
        timetableEnd: end,
        ...(dto.breaks !== undefined
          ? { timetableBreaks: parseRanges(dto.breaks).map((b) => `${b.start}-${b.end}`).join(',') }
          : {}),
        ...(dto.slotMinutes ? { timetableSlotMinutes: dto.slotMinutes } : {}),
      },
    });
    return this.loadSettings(schoolId);
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
        where: { user: { schoolId, role: { in: ['ENSEIGNANT', 'DIRECTOR'] } } },
        select: { id: true, position: true, user: { select: { firstName: true, lastName: true, role: true } } },
        orderBy: { user: { lastName: 'asc' } },
      }),
      this.prisma.room.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
      this.prisma.term.findMany({ where: { academicYearId: yearId }, select: { id: true, name: true, order: true }, orderBy: { order: 'asc' } }),
      this.loadSettings(schoolId),
      this.prisma.staffMember.findUnique({ where: { userId: user.userId }, select: { id: true } }),
    ]);
    return {
      academicYear: year,
      classes: classes.map(({ _count, ...c }) => ({ ...c, studentCount: _count.enrollments })),
      subjects,
      teachers: teachers.map((t) => ({ id: t.id, name: teacherDisplayName(t.user), position: t.position })),
      rooms,
      terms,
      settings,
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
      this.loadSettings(schoolId),
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

  async check(user: AuthUser, dto: CheckSlotDto) {
    const schoolId = this.requireSchool(user);
    const klass = await this.assertRefs(schoolId, dto);
    return { conflicts: await this.conflictsFor(schoolId, klass.academicYearId, { ...dto, id: dto.id }) };
  }

  async create(user: AuthUser, dto: SessionDto) {
    const schoolId = this.requireSchool(user);
    const klass = await this.assertRefs(schoolId, dto);
    const conflicts = await this.conflictsFor(schoolId, klass.academicYearId, dto);
    this.refuseIfBlocking(conflicts, dto.force);
    const created = await this.prisma.timetableSession.create({
      data: { ...this.data(dto), schoolId, academicYearId: klass.academicYearId },
      include: SESSION_INCLUDE,
    });
    return this.present(created, conflicts);
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
    const conflicts = await this.conflictsFor(schoolId, klass.academicYearId, { ...merged, id });
    this.refuseIfBlocking(conflicts, dto.force);
    const updated = await this.prisma.timetableSession.update({
      where: { id },
      data: { ...this.data(merged), academicYearId: klass.academicYearId },
      include: SESSION_INCLUDE,
    });
    return this.present(updated, conflicts);
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
      force: dto.force,
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

    const settings = await this.loadSettings(schoolId);
    const days = settings.days.length ? settings.days : [1, 2, 3, 4, 5, 6];
    const ordered = [...days.filter((d) => d > source.dayOfWeek), ...days.filter((d) => d < source.dayOfWeek)];
    for (const day of ordered) {
      const candidate = { ...base, dayOfWeek: day };
      const conflicts = await this.conflictsFor(schoolId, source.academicYearId, candidate);
      if (!hasBlockingConflict(conflicts)) return this.create(user, candidate);
    }
    throw new ConflictException({
      message: `Aucun autre jour n'est libre de ${source.startTime} à ${source.endTime} pour cette classe, cet enseignant et cette salle`,
      conflicts: [],
    });
  }

  async remove(user: AuthUser, id: string) {
    const schoolId = this.requireSchool(user);
    await this.findOwned(schoolId, id);
    await this.prisma.timetableSession.delete({ where: { id } });
    return { success: true };
  }

  // ---------------------------------------------------------------- rooms

  listRooms(user: AuthUser) {
    const schoolId = this.requireSchool(user);
    return this.prisma.room.findMany({
      where: { schoolId },
      include: { _count: { select: { sessions: true } } },
      orderBy: { name: 'asc' },
    });
  }

  createRoom(user: AuthUser, dto: RoomDto) {
    const schoolId = this.requireSchool(user);
    return this.prisma.room.create({ data: { ...dto, name: dto.name.trim(), schoolId } });
  }

  async updateRoom(user: AuthUser, id: string, dto: UpdateRoomDto) {
    const schoolId = this.requireSchool(user);
    await this.findOwnedRoom(schoolId, id);
    return this.prisma.room.update({ where: { id }, data: { ...dto, ...(dto.name ? { name: dto.name.trim() } : {}) } });
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
      this.loadSettings(schoolId),
    ]);
    return [...validateSlot(slot, settings), ...findConflicts(slot, others, names)];
  }

  private refuseIfBlocking(conflicts: Conflict[], force?: boolean) {
    const invalid = conflicts.filter((c) => c.kind === 'INVALID');
    if (invalid.length) throw new BadRequestException(invalid.map((c) => c.message).join(' · '));
    if (!force && hasBlockingConflict(conflicts)) {
      throw new ConflictException({
        message: 'Ce créneau est en conflit : ' + conflicts.filter((c) => c.severity === 'error').map((c) => c.message).join(' · '),
        conflicts,
      });
    }
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

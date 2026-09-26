import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { assertTeacherInSchool } from '../common/tenant-ownership';
import { ClassDemand, DAY_LABELS, DEFAULT_GRID, Entry, generate, Grid, TimetableConstraints, validate } from './engine';

type Settings = Grid & { periodLabels: string[] };

@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private sid(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  async settings(user: AuthUser): Promise<Settings> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: this.sid(user) }, select: { timetableSettings: true } });
    return { ...DEFAULT_GRID, ...((school.timetableSettings as Partial<Settings> | null) ?? {}) };
  }

  async updateSettings(user: AuthUser, s: Settings) {
    if (!s.days.every((d) => d >= 1 && d <= 6) || s.periodsPerDay < 1 || s.periodsPerDay > 12) {
      throw new BadRequestException('Grille horaire invalide');
    }
    await this.prisma.school.update({ where: { id: this.sid(user) }, data: { timetableSettings: s as unknown as Prisma.InputJsonValue } });
    return s;
  }

  rooms(user: AuthUser) {
    return this.prisma.room.findMany({ where: { schoolId: this.sid(user) }, orderBy: { name: 'asc' } });
  }

  createRoom(user: AuthUser, name: string, capacity?: number) {
    return this.prisma.room.create({ data: { schoolId: this.sid(user), name, capacity: capacity ?? 40 } });
  }

  async deleteRoom(user: AuthUser, id: string) {
    const room = await this.prisma.room.findFirst({ where: { id, schoolId: this.sid(user) } });
    if (!room) throw new NotFoundException('Salle introuvable');
    await this.prisma.room.delete({ where: { id } });
    return { success: true };
  }

  private async ownClass(user: AuthUser, classId: string) {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId: this.sid(user) } });
    if (!klass) throw new NotFoundException('Classe introuvable');
    return klass;
  }

  /** Demands of a class = its subjects with teacher and weekly hours (ClassSubject). */
  private async demandsFor(classIds: string[]): Promise<ClassDemand[]> {
    const subjects = await this.prisma.classSubject.findMany({ where: { classId: { in: classIds } } });
    return classIds.map((classId) => ({
      classId,
      demands: subjects
        .filter((s) => s.classId === classId && s.weeklyHours > 0)
        .map((s) => ({ subjectId: s.subjectId, teacherId: s.teacherId, hours: s.weeklyHours })),
    }));
  }

  private async unavailability(schoolId: string) {
    const staff = await this.prisma.staffMember.findMany({ where: { user: { schoolId }, unavailability: { not: Prisma.DbNull } }, select: { id: true, unavailability: true } });
    return Object.fromEntries(staff.map((s) => [s.id, (s.unavailability as { day: number; period: number }[]) ?? []]));
  }

  /** Entries of all timetables of the school with the given status, except the listed classes. */
  private async otherEntries(schoolId: string, excludeClassIds: string[], status: 'PUBLISHED' | 'DRAFT') {
    const rows = await this.prisma.timetableEntry.findMany({
      where: { timetable: { schoolId, status, classId: { notIn: excludeClassIds } } },
      include: { timetable: { select: { classId: true } } },
    });
    return rows.map<Entry>((r) => ({ classId: r.timetable.classId, day: r.day, period: r.period, subjectId: r.subjectId, teacherId: r.teacherId, roomId: r.roomId }));
  }

  async generate(user: AuthUser, classIds: string[] | undefined, constraints: TimetableConstraints = {}) {
    const schoolId = this.sid(user);
    const classes = await this.prisma.class.findMany({
      where: { schoolId, ...(classIds?.length ? { id: { in: classIds } } : {}) },
      select: { id: true },
    });
    if (classIds?.length && classes.length !== new Set(classIds).size) throw new NotFoundException('Classe introuvable');
    const ids = classes.map((c) => c.id);
    const grid = await this.settings(user);
    const [demands, rooms, unavailable, fixed] = await Promise.all([
      this.demandsFor(ids),
      this.prisma.room.findMany({ where: { schoolId }, select: { id: true } }),
      this.unavailability(schoolId),
      this.otherEntries(schoolId, ids, 'PUBLISHED'),
    ]);

    const result = generate({ grid, classes: demands, rooms: rooms.map((r) => r.id), fixed, unavailable, constraints });
    for (const classId of ids) {
      await this.saveDraft(schoolId, classId, result.entries.filter((e) => e.classId === classId));
    }
    const conflicts = validate({ grid, entries: [...fixed, ...result.entries], demands, unavailable, constraints });
    await this.audit.record(user, 'GENERATE', 'Timetable', ids.join(','), { after: { classes: ids.length, placed: result.entries.length, unplaced: result.unplaced.length } });
    return { classes: ids.length, placed: result.entries.length, unplaced: result.unplaced, conflicts };
  }

  private async saveDraft(schoolId: string, classId: string, entries: Entry[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.timetable.deleteMany({ where: { classId, status: 'DRAFT' } });
      await tx.timetable.create({
        data: {
          schoolId,
          classId,
          status: 'DRAFT',
          entries: { create: entries.map((e) => ({ day: e.day, period: e.period, subjectId: e.subjectId, teacherId: e.teacherId, roomId: e.roomId })) },
        },
      });
    });
  }

  async get(user: AuthUser, classId: string, status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED') {
    await this.ownClass(user, classId);
    const tt = await this.prisma.timetable.findUnique({
      where: { classId_status: { classId, status } },
      include: {
        entries: {
          include: {
            subject: { select: { name: true, code: true } },
            teacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
            room: { select: { name: true } },
          },
          orderBy: [{ day: 'asc' }, { period: 'asc' }],
        },
      },
    });
    return { settings: await this.settings(user), timetable: tt };
  }

  /** Manual edition of the draft: ownership of every referenced id is checked, then validated. */
  async updateDraft(user: AuthUser, classId: string, entries: Omit<Entry, 'classId'>[]) {
    const schoolId = this.sid(user);
    await this.ownClass(user, classId);
    const subjectIds = [...new Set(entries.map((e) => e.subjectId))];
    if ((await this.prisma.subject.count({ where: { id: { in: subjectIds }, schoolId } })) !== subjectIds.length) {
      throw new NotFoundException('Matière introuvable');
    }
    for (const t of new Set(entries.map((e) => e.teacherId).filter(Boolean) as string[])) await assertTeacherInSchool(this.prisma, t, schoolId);
    const roomIds = [...new Set(entries.map((e) => e.roomId).filter(Boolean) as string[])];
    if ((await this.prisma.room.count({ where: { id: { in: roomIds }, schoolId } })) !== roomIds.length) {
      throw new NotFoundException('Salle introuvable');
    }
    const full = entries.map((e) => ({ ...e, classId }));
    const slots = new Set(full.map((e) => `${e.day}|${e.period}`));
    if (slots.size !== full.length) throw new BadRequestException('Deux cours sur le même créneau pour cette classe');
    await this.saveDraft(schoolId, classId, full);
    return this.check(user, classId);
  }

  /** Conflicts of the class draft against every other timetable of the school. */
  async check(user: AuthUser, classId: string) {
    const schoolId = this.sid(user);
    await this.ownClass(user, classId);
    const draft = await this.prisma.timetable.findUnique({ where: { classId_status: { classId, status: 'DRAFT' } }, include: { entries: true } });
    if (!draft) throw new NotFoundException('Aucun brouillon pour cette classe');
    const [grid, demands, unavailable, published] = await Promise.all([
      this.settings(user),
      this.demandsFor([classId]),
      this.unavailability(schoolId),
      this.otherEntries(schoolId, [classId], 'PUBLISHED'),
    ]);
    const own = draft.entries.map<Entry>((e) => ({ classId, day: e.day, period: e.period, subjectId: e.subjectId, teacherId: e.teacherId, roomId: e.roomId }));
    const conflicts = validate({ grid, entries: [...published, ...own], demands, unavailable }).filter(
      (c) => c.classId === classId || own.some((o) => o.day === c.day && o.period === c.period && (o.teacherId === c.teacherId)),
    );
    return { conflicts, errors: conflicts.filter((c) => c.severity === 'error').length };
  }

  async publish(user: AuthUser, classId: string) {
    const klass = await this.ownClass(user, classId);
    const { errors, conflicts } = await this.check(user, classId);
    if (errors > 0) throw new BadRequestException({ message: `Publication impossible : ${errors} conflit(s) bloquant(s)`, conflicts });
    const published = await this.prisma.$transaction(async (tx) => {
      await tx.timetable.deleteMany({ where: { classId, status: 'PUBLISHED' } });
      return tx.timetable.update({
        where: { classId_status: { classId, status: 'DRAFT' } },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
        include: { entries: { select: { teacher: { select: { userId: true } } } } },
      });
    });
    const teacherUsers = new Set(published.entries.map((e) => e.teacher?.userId).filter(Boolean) as string[]);
    for (const userId of teacherUsers) {
      await this.notifications.notify(userId, 'Emploi du temps', `L'emploi du temps de la classe ${klass.name} a été publié.`);
    }
    await this.audit.record(user, 'PUBLISH', 'Timetable', classId);
    return { published: true, warnings: conflicts.length };
  }

  /** Teacher's own weekly schedule across classes (published only). */
  async mine(user: AuthUser) {
    const staff = await this.prisma.staffMember.findUnique({ where: { userId: user.userId } });
    if (!staff) return { settings: await this.settings(user), entries: [] };
    const entries = await this.prisma.timetableEntry.findMany({
      where: { teacherId: staff.id, timetable: { status: 'PUBLISHED', schoolId: this.sid(user) } },
      include: { subject: { select: { name: true } }, room: { select: { name: true } }, timetable: { select: { class: { select: { name: true } } } } },
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
    });
    return { settings: await this.settings(user), entries };
  }

  async exportCsv(user: AuthUser, classId: string) {
    const { settings, timetable } = await this.get(user, classId);
    if (!timetable) throw new NotFoundException("Aucun emploi du temps publié pour cette classe");
    const rows = [['Jour', 'Heure', 'Début', 'Matière', 'Enseignant', 'Salle']];
    for (const e of timetable.entries) {
      rows.push([
        DAY_LABELS[e.day],
        String(e.period),
        settings.periodLabels[e.period - 1] ?? '',
        e.subject.name,
        e.teacher ? `${e.teacher.user.firstName} ${e.teacher.user.lastName}` : '',
        e.room?.name ?? '',
      ]);
    }
    // Excel (fr-FR) opens ';'-separated UTF-8 with BOM correctly. Formula injection neutralised.
    const cell = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
    return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  }

  async exportIcs(user: AuthUser, classId: string) {
    const klass = await this.ownClass(user, classId);
    const { settings, timetable } = await this.get(user, classId);
    if (!timetable) throw new NotFoundException("Aucun emploi du temps publié pour cette classe");
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GESTION SCHOOL//Emploi du temps//FR', `X-WR-CALNAME:${esc(klass.name)}`];
    for (const e of timetable.entries) {
      const [h, m] = (settings.periodLabels[e.period - 1] ?? '08:00').split(':').map(Number);
      const start = new Date(monday);
      start.setDate(monday.getDate() + e.day - 1);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + 55 * 60_000);
      lines.push(
        'BEGIN:VEVENT',
        `UID:${e.id}@gestion-school`,
        `DTSTAMP:${fmt(new Date())}`,
        `DTSTART:${fmt(start)}`,
        `DTEND:${fmt(end)}`,
        'RRULE:FREQ=WEEKLY',
        `SUMMARY:${esc(e.subject.name)}`,
        ...(e.room ? [`LOCATION:${esc(e.room.name)}`] : []),
        ...(e.teacher ? [`DESCRIPTION:${esc(`${e.teacher.user.firstName} ${e.teacher.user.lastName}`)}`] : []),
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  /** Weekly hours per subject of a class (edited from the timetable screen). */
  async setWeeklyHours(user: AuthUser, classId: string, subjectId: string, weeklyHours: number) {
    await this.ownClass(user, classId);
    const cs = await this.prisma.classSubject.findUnique({ where: { classId_subjectId: { classId, subjectId } } });
    if (!cs) throw new NotFoundException("Cette matière n'est pas affectée à la classe");
    return this.prisma.classSubject.update({ where: { id: cs.id }, data: { weeklyHours } });
  }
}

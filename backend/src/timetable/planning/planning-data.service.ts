import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/current-user.decorator';
import { YearGrid, gridFromStrings } from '../domain/grid';
import { PlanningData, StoredLesson, TimeWindow, mergeWindows, volumeKey } from '../domain/rules';

export const TEACHER_ROLES = ['ENSEIGNANT', 'DIRECTOR'] as const;

type Tx = Prisma.TransactionClient | PrismaService;

export interface ChangeInput {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SWAP' | 'LOCK' | 'GENERATE' | 'UNDO';
  sessionId?: string | null;
  before?: object | null;
  after?: object | null;
  summary: string;
}

export function displayName(user: { firstName: string; lastName: string }) {
  return `${user.firstName} ${user.lastName}`.trim();
}

/** Loads the planning data of a school year for the rules, and writes the change history. */
@Injectable()
export class PlanningDataService {
  constructor(private readonly prisma: PrismaService) {}

  /** The year grid, or the school-wide defaults when the year has none yet. */
  async loadGrid(schoolId: string, academicYearId: string): Promise<YearGrid> {
    const row = await this.prisma.timetableGrid.findUnique({ where: { academicYearId } });
    if (row) return gridFromStrings(row);
    const school = await this.prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { timetableDays: true, timetableStart: true, timetableEnd: true, timetableBreaks: true, timetableSlotMinutes: true },
    });
    return gridFromStrings({
      days: school.timetableDays,
      start: school.timetableStart,
      end: school.timetableEnd,
      slotMinutes: school.timetableSlotMinutes,
      breaks: school.timetableBreaks,
      freeHalfDays: '',
      halfDaySplit: '12:00',
    });
  }

  async loadData(schoolId: string, academicYearId: string): Promise<PlanningData> {
    const [grid, classes, subjects, teachers, rooms, qualifications, windows, volumes] = await Promise.all([
      this.loadGrid(schoolId, academicYearId),
      this.prisma.class.findMany({ where: { schoolId, academicYearId }, select: { id: true, name: true, level: true } }),
      this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, name: true, coefficient: true } }),
      this.prisma.staffMember.findMany({
        where: { user: { schoolId, role: { in: [...TEACHER_ROLES] } } },
        select: { id: true, weeklyMaxMinutes: true, user: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.room.findMany({ where: { schoolId }, select: { id: true, name: true, subjects: { select: { id: true } } } }),
      this.prisma.teacherQualification.findMany({ where: { staffMember: { user: { schoolId } } } }),
      this.prisma.teacherAvailability.findMany({ where: { academicYearId, staffMember: { user: { schoolId } } } }),
      this.prisma.officialVolume.findMany({ where: { schoolId, academicYearId } }),
    ]);
    const availability = new Map<string, TimeWindow[]>();
    for (const w of windows) {
      const list = availability.get(w.staffMemberId) ?? [];
      list.push({ day: w.dayOfWeek, start: w.startTime, end: w.endTime });
      availability.set(w.staffMemberId, list);
    }
    for (const [k, v] of availability) availability.set(k, mergeWindows(v));
    return {
      grid,
      classes: new Map(classes.map((c) => [c.id, c])),
      subjects: new Map(subjects.map((s) => [s.id, s])),
      teachers: new Map(teachers.map((t) => [t.id, { id: t.id, name: displayName(t.user), weeklyMaxMinutes: t.weeklyMaxMinutes }])),
      rooms: new Map(rooms.map((r) => [r.id, { id: r.id, name: r.name, subjectIds: r.subjects.map((s) => s.id) }])),
      qualifications: qualifications.map((q) => ({ teacherId: q.staffMemberId, subjectId: q.subjectId, level: q.level, classId: q.classId })),
      availability,
      volumes: new Map(
        volumes.map((v) => [volumeKey(v.level, v.subjectId), { minutesPerWeek: v.minutesPerWeek, maxSessionMinutes: v.maxSessionMinutes, coefficient: v.coefficient }]),
      ),
    };
  }

  yearLessons(schoolId: string, academicYearId: string, db: Tx = this.prisma): Promise<StoredLesson[]> {
    return db.timetableSession.findMany({
      where: { schoolId, academicYearId },
      select: { id: true, classId: true, subjectId: true, teacherId: true, roomId: true, termId: true, dayOfWeek: true, startTime: true, endTime: true, locked: true },
    });
  }

  newBatch() {
    return randomUUID();
  }

  async userName(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return u ? displayName(u) : null;
  }

  async record(db: Tx, user: AuthUser, schoolId: string, academicYearId: string, batchId: string, changes: ChangeInput[], userName?: string | null) {
    if (!changes.length) return;
    const name = userName === undefined ? await this.userName(user.userId) : userName;
    await db.timetableChange.createMany({
      data: changes.map((c) => ({
        schoolId,
        academicYearId,
        batchId,
        action: c.action,
        sessionId: c.sessionId ?? null,
        before: c.before ? JSON.stringify(c.before) : null,
        after: c.after ? JSON.stringify(c.after) : null,
        summary: c.summary,
        userId: user.userId,
        userName: name,
      })),
    });
  }
}

/** Fields of a session kept in history snapshots (enough to recreate it). */
export const SNAPSHOT_FIELDS = {
  id: true,
  classId: true,
  subjectId: true,
  teacherId: true,
  roomId: true,
  termId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  label: true,
  notes: true,
  locked: true,
  importId: true,
} satisfies Prisma.TimetableSessionSelect;

export type SessionSnapshot = Prisma.TimetableSessionGetPayload<{ select: typeof SNAPSHOT_FIELDS }>;

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherScopeService } from '../common/teacher-scope.service';
import { AuthUser } from '../common/current-user.decorator';
import { MANAGEMENT } from '../common/roles';
import { PageQueryDto, pageArgs, pageResult } from '../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingService } from '../messaging/messaging.service';

export const DISCIPLINE_KINDS = ['OBSERVATION', 'AVERTISSEMENT', 'RETENUE', 'EXCLUSION', 'CONVOCATION', 'ENCOURAGEMENT'] as const;
export type DisciplineKind = (typeof DISCIPLINE_KINDS)[number];

export const DISCIPLINE_LABELS: Record<DisciplineKind, string> = {
  OBSERVATION: 'Observation',
  AVERTISSEMENT: 'Avertissement',
  RETENUE: 'Retenue',
  EXCLUSION: 'Exclusion temporaire',
  CONVOCATION: 'Convocation des parents',
  ENCOURAGEMENT: 'Encouragement',
};

/** Kinds serious enough for an SMS to the family (when the school switched the event on). */
const SMS_KINDS: DisciplineKind[] = ['EXCLUSION', 'CONVOCATION'];

export interface DisciplineInput {
  studentId: string;
  date: string;
  kind: DisciplineKind;
  reason: string;
  description?: string;
  sanction?: string;
  visibleToParents?: boolean;
}

const INCLUDE = { student: { select: { id: true, firstName: true, lastName: true, matricule: true, enrollments: { where: { withdrawalDate: null }, select: { class: { select: { id: true, name: true } } }, orderBy: { enrollmentDate: 'desc' }, take: 1 } } } } satisfies Prisma.DisciplineRecordInclude;

@Injectable()
export class DisciplineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly messaging: MessagingService,
    private readonly scope: TeacherScopeService,
  ) {}

  private school(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  private async owned(user: AuthUser, id: string) {
    const record = await this.prisma.disciplineRecord.findUnique({ where: { id }, include: INCLUDE });
    if (!record || record.schoolId !== this.school(user)) throw new NotFoundException('Signalement introuvable');
    return record;
  }

  async create(user: AuthUser, dto: DisciplineInput) {
    const schoolId = this.school(user);
    const student = await this.prisma.student.findUnique({ where: { id: dto.studentId }, include: { parents: { where: { archivedAt: null, userId: { not: null } } } } });
    if (!student || student.schoolId !== schoolId) throw new NotFoundException('Élève introuvable');
    await this.scope.assertStudent(user, student.id);
    if (student.archivedAt) throw new BadRequestException('Cet élève est archivé');
    const date = new Date(dto.date);
    if (date.getTime() > Date.now() + 86400000) throw new BadRequestException('La date ne peut pas être dans le futur');
    const author = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } });

    const record = await this.prisma.disciplineRecord.create({
      data: {
        schoolId,
        studentId: student.id,
        date,
        kind: dto.kind,
        reason: dto.reason.trim(),
        description: dto.description?.trim() || null,
        sanction: dto.sanction?.trim() || null,
        visibleToParents: dto.visibleToParents ?? true,
        reportedById: user.userId,
        reportedByName: author ? `${author.firstName} ${author.lastName}` : null,
      },
      include: INCLUDE,
    });

    if (record.visibleToParents) {
      const label = DISCIPLINE_LABELS[dto.kind];
      for (const parent of student.parents) {
        await this.notifications.notify(parent.userId, `Vie scolaire : ${label.toLowerCase()}`, `${student.firstName} ${student.lastName} — ${record.reason}${record.sanction ? ` Décision : ${record.sanction}.` : ''}`);
      }
      if (SMS_KINDS.includes(dto.kind)) {
        await this.messaging
          .sendToGuardians(student.id, 'DISCIPLINE', (s, school) => `${school}: ${label.toLowerCase()} concernant ${s.firstName} ${s.lastName}. Motif : ${record.reason}. Merci de contacter l'etablissement.`, `discipline:${record.id}`)
          .catch(() => undefined);
      }
    }
    return record;
  }

  async findAll(user: AuthUser, page: PageQueryDto, filters: { studentId?: string; classId?: string; kind?: string; from?: string; to?: string }) {
    // A teacher sees the records of the pupils of his classes
    const own = await this.scope.classIds(user);
    const where: Prisma.DisciplineRecordWhereInput = {
      schoolId: this.school(user),
      ...(own ? { AND: [{ student: { enrollments: { some: { classId: { in: own } } } } }] } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.classId ? { student: { enrollments: { some: { classId: filters.classId, withdrawalDate: null } } } } : {}),
      ...(filters.from || filters.to ? { date: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lt: new Date(new Date(filters.to).getTime() + 86400000) } : {}) } } : {}),
      ...(page.q
        ? { OR: [{ reason: { contains: page.q, mode: 'insensitive' } }, { student: { OR: [{ lastName: { contains: page.q, mode: 'insensitive' } }, { firstName: { contains: page.q, mode: 'insensitive' } }, { matricule: { contains: page.q, mode: 'insensitive' } }] } }] }
        : {}),
    };
    const paged = { ...page, page: page.page ?? 1 };
    const [rows, total] = await Promise.all([
      this.prisma.disciplineRecord.findMany({ where, include: INCLUDE, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], ...pageArgs(paged, 25) }),
      this.prisma.disciplineRecord.count({ where }),
    ]);
    return pageResult(paged, rows, total, 25);
  }

  /** Counts per kind since the start of the school year, and the pupils with the most sanctions. */
  async stats(user: AuthUser) {
    const schoolId = this.school(user);
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true }, select: { startDate: true } });
    const since = year?.startDate ?? new Date(Date.now() - 365 * 86400000);
    const own = await this.scope.classIds(user);
    const mine = own ? { student: { enrollments: { some: { classId: { in: own } } } } } : {};
    const sanctions = DISCIPLINE_KINDS.filter((k) => k !== 'ENCOURAGEMENT' && k !== 'OBSERVATION');
    const [byKind, top] = await Promise.all([
      this.prisma.disciplineRecord.groupBy({ by: ['kind'], where: { schoolId, date: { gte: since }, ...mine }, _count: true }),
      this.prisma.disciplineRecord.groupBy({ by: ['studentId'], where: { schoolId, date: { gte: since }, kind: { in: [...sanctions] }, ...mine }, _count: true, orderBy: { _count: { studentId: 'desc' } }, take: 5 }),
    ]);
    const students = await this.prisma.student.findMany({ where: { id: { in: top.map((t) => t.studentId) } }, select: { id: true, firstName: true, lastName: true } });
    return {
      since,
      byKind: DISCIPLINE_KINDS.map((kind) => ({ kind, label: DISCIPLINE_LABELS[kind], count: byKind.find((b) => b.kind === kind)?._count ?? 0 })),
      mostSanctioned: top.map((t) => ({ studentId: t.studentId, name: (() => { const s = students.find((x) => x.id === t.studentId); return s ? `${s.lastName} ${s.firstName}` : 'Élève'; })(), count: t._count })),
    };
  }

  /** The author of a record, or the management, may correct it. */
  async update(user: AuthUser, id: string, dto: Partial<Omit<DisciplineInput, 'studentId'>>) {
    const record = await this.owned(user, id);
    if (record.reportedById !== user.userId && !(MANAGEMENT as readonly string[]).includes(user.role)) throw new ForbiddenException("Seul l'auteur du signalement ou la direction peut le modifier");
    return this.prisma.disciplineRecord.update({
      where: { id },
      data: {
        ...(dto.date ? { date: new Date(dto.date) } : {}),
        ...(dto.kind ? { kind: dto.kind } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.sanction !== undefined ? { sanction: dto.sanction.trim() || null } : {}),
        ...(dto.visibleToParents !== undefined ? { visibleToParents: dto.visibleToParents } : {}),
      },
      include: INCLUDE,
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.owned(user, id);
    await this.prisma.disciplineRecord.delete({ where: { id } });
    return { success: true };
  }

  /** What the family sees in the portal. */
  forParent(studentId: string) {
    return this.prisma.disciplineRecord.findMany({
      where: { studentId, visibleToParents: true },
      select: { id: true, date: true, kind: true, reason: true, sanction: true },
      orderBy: { date: 'desc' },
      take: 50,
    });
  }
}

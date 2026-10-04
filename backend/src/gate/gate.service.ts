import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingService } from '../messaging/messaging.service';
import { OFFICE } from '../common/roles';
import { PageQueryDto, pageArgs, pageResult } from '../common/pagination';
import { DOUBLE_SCAN_SECONDS, GateKind, gateMessage, isEarlyExit, isLate, nextKind } from './gate-rules';

export interface GateInput {
  studentId: string;
  kind?: GateKind;
  accessPoint?: string;
  method?: 'MANUEL' | 'QR' | 'BADGE';
  reason?: string;
  /** Guardian collecting the child (must be allowed to) */
  pickedUpParentId?: string;
  /** Another adult collecting the child, named by the office */
  pickedUpBy?: string;
}

const EVENT = {
  id: true, kind: true, occurredAt: true, accessPoint: true, method: true, late: true, early: true, reason: true, pickedUpBy: true, recordedByName: true,
  student: { select: { id: true, firstName: true, lastName: true, matricule: true } },
} as const;

/**
 * Arrivals and departures at the school gate. Each passage is one row (who, when, where, how, recorded
 * by whom); the family is told at once. The roll call of the teachers stays a separate record.
 */
@Injectable()
export class GateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly messaging: MessagingService,
  ) {}

  private school(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  private dayBounds(date?: string) {
    const start = date ? new Date(`${date}T00:00:00`) : new Date();
    if (Number.isNaN(start.getTime())) throw new BadRequestException('Date invalide (AAAA-MM-JJ)');
    start.setHours(0, 0, 0, 0);
    return { gte: start, lt: new Date(start.getTime() + 86400000) };
  }

  /** Records one passage and tells the family. */
  async record(user: AuthUser, dto: GateInput) {
    const schoolId = this.school(user);
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, schoolId },
      include: {
        school: { select: { timetableStart: true, timetableEnd: true } },
        parents: { where: { archivedAt: null }, select: { id: true, userId: true, firstName: true, lastName: true } },
        guardianships: { select: { parentId: true, canPickUp: true } },
        enrollments: { where: { withdrawalDate: null }, select: { class: { select: { name: true } } }, orderBy: { enrollmentDate: 'desc' }, take: 1 },
      },
    });
    if (!student) throw new NotFoundException('Élève introuvable');
    if (student.archivedAt) throw new BadRequestException("Cet élève n'est plus inscrit dans l'établissement");

    const now = new Date();
    const last = await this.prisma.gateEvent.findFirst({ where: { studentId: student.id }, orderBy: { occurredAt: 'desc' } });
    const kind = dto.kind ?? nextKind(last, now);
    // The same card shown twice in a row is one passage, not an arrival followed by a departure
    const justRecorded = !!last && now.getTime() - last.occurredAt.getTime() < DOUBLE_SCAN_SECONDS * 1000;
    if (last && justRecorded && (!dto.kind || last.kind === kind)) {
      return { ...(await this.prisma.gateEvent.findUniqueOrThrow({ where: { id: last.id }, select: EVENT })), duplicate: true, class: student.enrollments[0]?.class.name ?? null };
    }

    const late = kind === 'ENTREE' && isLate(now, student.school.timetableStart);
    const early = kind === 'SORTIE' && isEarlyExit(now, student.school.timetableEnd);
    let pickedUpBy: string | null = null;
    if (kind === 'SORTIE' && dto.pickedUpParentId) {
      const guardian = student.parents.find((p) => p.id === dto.pickedUpParentId);
      if (!guardian) throw new BadRequestException("Cette personne n'est pas un responsable de l'élève");
      const link = student.guardianships.find((g) => g.parentId === guardian.id);
      if (link && !link.canPickUp) throw new ForbiddenException(`${guardian.firstName} ${guardian.lastName} n'est pas autorisé(e) à récupérer cet élève`);
      pickedUpBy = `${guardian.firstName} ${guardian.lastName}`;
    } else if (kind === 'SORTIE' && dto.pickedUpBy?.trim()) {
      // An adult who is not a recorded guardian: the office takes the responsibility, with a reason
      if (!(OFFICE as readonly string[]).includes(user.role)) throw new ForbiddenException("Seul le secrétariat ou la direction confie un élève à une personne qui n'est pas un responsable enregistré");
      if (!dto.reason?.trim()) throw new BadRequestException('Indiquez le motif de cette sortie');
      pickedUpBy = dto.pickedUpBy.trim().slice(0, 120);
    }
    if (early && !dto.reason?.trim()) throw new BadRequestException('Sortie avant la fin des cours : indiquez le motif');

    const author = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } });
    const event = await this.prisma.gateEvent.create({
      data: {
        schoolId,
        studentId: student.id,
        kind,
        occurredAt: now,
        accessPoint: dto.accessPoint?.trim().slice(0, 80) || null,
        method: dto.method ?? 'MANUEL',
        late,
        early,
        reason: dto.reason?.trim().slice(0, 300) || null,
        pickedUpParentId: kind === 'SORTIE' ? (dto.pickedUpParentId ?? null) : null,
        pickedUpBy,
        recordedById: user.userId,
        recordedByName: author ? `${author.firstName} ${author.lastName}` : null,
      },
      select: EVENT,
    });

    const text = gateMessage(student, kind, now, pickedUpBy);
    for (const parent of student.parents) await this.notifications.notify(parent.userId, kind === 'ENTREE' ? 'Arrivée' : 'Sortie', text);
    // SMS only when the school switched the event on; a sending problem never blocks the gate
    await this.messaging.sendToGuardians(student.id, 'GATE', (_s, school) => `${school}: ${text}`, `gate:${event.id}`).catch(() => undefined);

    return { ...event, duplicate: false, class: student.enrollments[0]?.class.name ?? null };
  }

  /** A card is shown at the gate: the pupil is found by the code printed on it. */
  async scan(user: AuthUser, token: string, accessPoint?: string) {
    const student = await this.prisma.student.findFirst({ where: { cardToken: token.trim(), schoolId: this.school(user) }, select: { id: true } });
    if (!student) throw new NotFoundException("Carte inconnue dans cet établissement");
    return this.record(user, { studentId: student.id, accessPoint, method: 'QR' });
  }

  async events(user: AuthUser, page: PageQueryDto, filters: { date?: string; studentId?: string; classId?: string; kind?: string }) {
    const where: Prisma.GateEventWhereInput = {
      schoolId: this.school(user),
      ...(filters.studentId ? { studentId: filters.studentId } : { occurredAt: this.dayBounds(filters.date) }),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.classId ? { student: { enrollments: { some: { classId: filters.classId, withdrawalDate: null } } } } : {}),
    };
    const paged = { ...page, page: page.page ?? 1 };
    const [rows, total] = await Promise.all([
      this.prisma.gateEvent.findMany({ where, select: EVENT, orderBy: { occurredAt: 'desc' }, ...pageArgs(paged, 50) }),
      this.prisma.gateEvent.count({ where }),
    ]);
    return pageResult(paged, rows, total, 50);
  }

  /** Today at the gate: arrivals, departures, late arrivals and the pupils still inside. */
  async today(user: AuthUser) {
    const schoolId = this.school(user);
    const rows = await this.prisma.gateEvent.findMany({ where: { schoolId, occurredAt: this.dayBounds() }, select: { studentId: true, kind: true, late: true, early: true, occurredAt: true }, orderBy: { occurredAt: 'asc' } });
    const lastKind = new Map<string, string>();
    for (const r of rows) lastKind.set(r.studentId, r.kind);
    return {
      entries: rows.filter((r) => r.kind === 'ENTREE').length,
      exits: rows.filter((r) => r.kind === 'SORTIE').length,
      late: rows.filter((r) => r.late).length,
      earlyExits: rows.filter((r) => r.early).length,
      inside: [...lastKind.values()].filter((k) => k === 'ENTREE').length,
    };
  }

  /** The QR card of a pupil; the code is created the first time, and can be renewed if the card is lost. */
  async card(user: AuthUser, studentId: string, renew = false) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: this.school(user) }, select: { id: true, firstName: true, lastName: true, matricule: true, cardToken: true } });
    if (!student) throw new NotFoundException('Élève introuvable');
    let token = student.cardToken;
    if (!token || renew) {
      token = randomBytes(18).toString('base64url');
      await this.prisma.student.update({ where: { id: student.id }, data: { cardToken: token } });
    }
    return { studentId: student.id, name: `${student.lastName} ${student.firstName}`, matricule: student.matricule, token, qr: await QRCode.toDataURL(token, { margin: 1, width: 260 }) };
  }

  /** The guardians who may collect a pupil, for the person at the gate. */
  async pickUp(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId: this.school(user) },
      select: { parents: { where: { archivedAt: null }, select: { id: true, firstName: true, lastName: true, phone: true } }, guardianships: { select: { parentId: true, relation: true, canPickUp: true } } },
    });
    if (!student) throw new NotFoundException('Élève introuvable');
    return student.parents.map((p) => {
      const link = student.guardianships.find((g) => g.parentId === p.id);
      return { id: p.id, name: `${p.firstName} ${p.lastName}`, phone: p.phone, relation: link?.relation ?? 'AUTRE', canPickUp: link?.canPickUp ?? true };
    });
  }

  // ---------------------------------------------------------------- families

  /** What a guardian sees: the last passages of his own child. */
  async forFamily(user: AuthUser, studentId: string) {
    const link = await this.prisma.parent.findFirst({ where: { userId: user.userId, archivedAt: null, students: { some: { id: studentId } } }, select: { id: true } });
    if (!link) throw new ForbiddenException();
    return this.prisma.gateEvent.findMany({
      where: { studentId, occurredAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      select: { id: true, kind: true, occurredAt: true, late: true, early: true, reason: true, pickedUpBy: true },
      orderBy: { occurredAt: 'desc' },
      take: 120,
    });
  }
}

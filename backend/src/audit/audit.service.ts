import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { AuditQueryDto } from './audit.dto';

/** Labels of journaled areas, for the filter and the table. */
export const AREA_LABELS: Record<string, string> = {
  auth: 'Connexion & sécurité',
  students: 'Élèves',
  parents: 'Parents',
  staff: 'Personnel',
  classes: 'Classes',
  subjects: 'Matières',
  grades: 'Notes',
  attendance: 'Présence',
  billing: 'Facturation',
  payroll: 'Paie',
  admissions: 'Admissions',
  timetable: 'Emplois du temps',
  transport: 'Transport',
  announcements: 'Annonces',
  showcase: 'Vitrine',
  'academic-years': 'Années scolaires',
  domains: 'Domaines',
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Journal of the user's school (all schools for the platform administrator), newest first. */
  async list(user: AuthUser, q: AuditQueryDto) {
    const pageSize = Math.min(q.pageSize ?? 50, 200);
    const page = Math.max(q.page ?? 1, 1);
    const where: Prisma.AuditLogWhereInput = {
      ...(user.role === 'SUPER_ADMIN' && !user.schoolId ? {} : { schoolId: user.schoolId }),
      ...(q.area ? { resource: { startsWith: q.area } } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.resourceId ? { resourceId: q.resourceId } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } } : {}),
      ...(q.q ? { OR: [{ resource: { contains: q.q, mode: 'insensitive' } }, { newValues: { contains: q.q, mode: 'insensitive' } }, { oldValues: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, role: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        resource: r.resource,
        area: AREA_LABELS[r.resource.split('/')[0]] ?? r.resource.split('/')[0],
        resourceId: r.resourceId,
        user: r.user ? { id: r.user.id, name: `${r.user.firstName} ${r.user.lastName}`, role: r.user.role, email: r.user.email } : null,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        oldValues: r.oldValues ? safeParse(r.oldValues) : null,
        newValues: r.newValues ? safeParse(r.newValues) : null,
      })),
    };
  }

  async filters(user: AuthUser) {
    const users = await this.prisma.user.findMany({
      where: { schoolId: user.schoolId, auditLogs: { some: {} } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: 'asc' },
    });
    return { areas: AREA_LABELS, users: users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` })) };
  }
}

function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

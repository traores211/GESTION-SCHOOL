import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './current-user.decorator';

/**
 * Audit trail of sensitive actions (payroll, payments, grades, roles, AI actions, settings).
 * Values are summaries chosen by the caller: never passwords or full personal records.
 * An audit failure is logged but never breaks the business action.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async record(
    user: Pick<AuthUser, 'userId' | 'schoolId'> | null,
    action: string,
    resource: string,
    resourceId: string,
    details?: { before?: unknown; after?: unknown },
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          resource,
          resourceId,
          userId: user?.userId ?? null,
          schoolId: user?.schoolId ?? null,
          oldValues: details?.before === undefined ? null : JSON.stringify(details.before),
          newValues: details?.after === undefined ? null : JSON.stringify(details.after),
        },
      });
    } catch (err) {
      this.logger.error(`Audit write failed for ${action} ${resource}/${resourceId}: ${(err as Error).message}`);
    }
  }

  list(schoolId: string, take = 100, resource?: string) {
    return this.prisma.auditLog.findMany({
      where: { schoolId, ...(resource ? { resource } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 500),
      include: { user: { select: { firstName: true, lastName: true, role: true } } },
    });
  }
}

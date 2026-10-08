import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import { AuthUser } from '../common/current-user.decorator';
import { PERMISSIONS, PERMISSION_GROUP_LABELS, PermissionKey, findPermission, isPermissionKey, roleImpliesPermission } from './catalog';

const CACHE_SECONDS = 60;

/**
 * Reads and writes the fine-grained permissions of a user, using the pre-existing `Permission`
 * table (whose rows are seeded on demand) and its `_PermissionToUser` pivot. The catalogue lives
 * in code so a new permission ships with a release and a review.
 */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisService,
  ) {}

  /** The full catalogue, grouped and labelled, for the back office picker. */
  catalog() {
    const groups = Object.entries(PERMISSION_GROUP_LABELS).map(([group, label]) => ({
      group,
      label,
      items: PERMISSIONS.filter((p) => p.group === group).map((p) => ({ key: p.key, label: p.label, description: p.description, impliedByRoles: p.impliedByRoles ?? [] })),
    }));
    return { groups };
  }

  /** The permission keys currently granted to a user (cached one minute). */
  async permissionsOf(userId: string): Promise<PermissionKey[]> {
    const cached = await this.cache.get(`perms:${userId}`);
    if (cached) return JSON.parse(cached);
    const rows = await this.prisma.user.findUnique({ where: { id: userId }, select: { permissions: { select: { name: true } } } });
    const keys = (rows?.permissions ?? []).map((p) => p.name).filter(isPermissionKey);
    await this.cache.set(`perms:${userId}`, JSON.stringify(keys), CACHE_SECONDS);
    return keys;
  }

  /** Full report of what the target user has: explicit grants + what they already get from the role. */
  async report(operator: AuthUser, userId: string) {
    await this.assertCanManage(operator, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, firstName: true, lastName: true, role: true, schoolId: true } });
    if (!user) throw new NotFoundException('Compte introuvable');
    const granted = await this.permissionsOf(userId);
    const items = PERMISSIONS.map((p) => ({
      key: p.key,
      group: p.group,
      label: p.label,
      description: p.description,
      /** Already in reach because of the role. The explicit grant does nothing then, but stays allowed. */
      impliedByRole: roleImpliesPermission(user.role, p.key),
      granted: granted.includes(p.key),
    }));
    return { user: { id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`, role: user.role }, items };
  }

  /**
   * Replaces the whole list of explicit permissions of a user. Keeping the API as a full set
   * (not add / remove) means the back office always posts a consistent state, with no race.
   */
  async set(operator: AuthUser, userId: string, keys: string[]) {
    await this.assertCanManage(operator, userId);
    const unique = Array.from(new Set(keys));
    const invalid = unique.filter((k) => !isPermissionKey(k));
    if (invalid.length) throw new BadRequestException(`Permissions inconnues : ${invalid.join(', ')}`);
    const target = unique as PermissionKey[];

    // Make sure every needed row exists in `Permission`; cheap upsert that is idempotent.
    for (const key of target) {
      const def = findPermission(key)!;
      await this.prisma.permission.upsert({
        where: { name: key },
        update: { description: def.description, resource: def.resource, action: def.action },
        create: { name: key, description: def.description, resource: def.resource, action: def.action },
      });
    }

    const ids = target.length
      ? (await this.prisma.permission.findMany({ where: { name: { in: target } }, select: { id: true } })).map((p) => p.id)
      : [];
    await this.prisma.user.update({ where: { id: userId }, data: { permissions: { set: ids.map((id) => ({ id })) } } });
    await this.cache.del(`perms:${userId}`);

    // Audit entry — grants are sensitive, we want them in the journal.
    await this.prisma.auditLog
      .create({
        data: {
          action: 'UPDATE',
          resource: 'permissions',
          resourceId: userId,
          userId: operator.userId,
          schoolId: operator.schoolId,
          newValues: JSON.stringify({ keys: target }),
        },
      })
      .catch(() => undefined);

    return this.report(operator, userId);
  }

  // ------------------------------------------------------------------ helpers

  /** Operators that may read/write the permissions of someone else. */
  private async assertCanManage(operator: AuthUser, targetUserId: string) {
    if (operator.role === 'SUPER_ADMIN') return;
    if (operator.role !== 'ADMIN_ORGANISATION') throw new ForbiddenException('Seul un administrateur peut gérer les permissions');
    // The target must belong to a school of the operator's organisation (same group).
    const [opSchool, targetSchool] = await Promise.all([
      operator.schoolId ? this.prisma.school.findUnique({ where: { id: operator.schoolId }, select: { organisationId: true } }) : Promise.resolve(null),
      this.prisma.user.findUnique({ where: { id: targetUserId }, select: { school: { select: { organisationId: true } } } }),
    ]);
    if (!opSchool || !targetSchool?.school || opSchool.organisationId !== targetSchool.school.organisationId) {
      throw new ForbiddenException('Vous ne pouvez pas gérer les permissions de ce compte');
    }
  }

  /** Programmatic check: `true` when the user has the permission (through role or explicit grant). */
  async userHas(userId: string, role: string, key: PermissionKey): Promise<boolean> {
    if (role === 'SUPER_ADMIN' || roleImpliesPermission(role, key)) return true;
    const granted = await this.permissionsOf(userId);
    return granted.includes(key);
  }
}

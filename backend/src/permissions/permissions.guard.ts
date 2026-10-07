import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionKey, roleImpliesPermission } from './catalog';
import { REQUIRE_PERMISSIONS_KEY } from './require-permissions.decorator';
import { PermissionsService } from './permissions.service';

/**
 * Fine-grained check. Runs after `JwtAuthGuard` (and usually after `RolesGuard`). When no
 * permission is required on the handler, the guard is a no-op. Otherwise the user must either:
 *   - have a role that implies the permission (configured per entry in `catalog.ts`),
 *   - or have been granted the permission explicitly in the DB.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly perms: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRE_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Authentification requise');

    // SUPER_ADMIN keeps every door open (platform-wide operator). Any other role must satisfy
    // each required permission, either through its role or through an explicit grant.
    if (user.role === 'SUPER_ADMIN') return true;

    const granted = await this.perms.permissionsOf(user.userId);
    const missing = required.filter((key) => !roleImpliesPermission(user.role, key) && !granted.includes(key));
    if (missing.length) {
      throw new ForbiddenException(`Permission manquante : ${missing.join(', ')}`);
    }
    return true;
  }
}

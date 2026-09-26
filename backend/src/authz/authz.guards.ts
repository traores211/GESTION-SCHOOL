import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ACCESS_KEY, AccessRule } from './decorators';
import { permissionsForRole } from './permissions';

function accessRule(reflector: Reflector, context: ExecutionContext): AccessRule | undefined {
  return reflector.getAllAndOverride<AccessRule>(ACCESS_KEY, [context.getHandler(), context.getClass()]);
}

/** Global JWT authentication; skipped only for routes explicitly marked @Public(). */
@Injectable()
export class GlobalJwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (accessRule(this.reflector, context)?.kind === 'public') return true;
    return super.canActivate(context);
  }
}

/** Global authorization, run after GlobalJwtAuthGuard. Deny-by-default. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger('Authz');

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = accessRule(this.reflector, context);
    const request = context.switchToHttp().getRequest();
    const route = `${request.method} ${request.route?.path ?? request.url}`;

    if (!rule) {
      this.logger.error(`Route without access rule refused: ${route}`);
      throw new ForbiddenException();
    }
    if (rule.kind === 'public' || rule.kind === 'authenticated') return true;

    const granted = permissionsForRole(request.user?.role);
    const missing = rule.permissions.filter((p) => !granted.includes(p));
    if (missing.length > 0) {
      // No personal data in logs: user id and role only.
      this.logger.warn(
        `Authorization denied: user=${request.user?.userId} role=${request.user?.role} route=${route} missing=${missing.join(',')}`,
      );
      throw new ForbiddenException();
    }
    return true;
  }
}

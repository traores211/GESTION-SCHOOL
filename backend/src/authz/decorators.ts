import { SetMetadata } from '@nestjs/common';
import { Permission } from './permissions';

export const ACCESS_KEY = 'authz:access';

/**
 * Every route must declare its access rule; routes without one are refused (deny-by-default,
 * enforced by PermissionsGuard and checked for all controllers by authz/route-coverage.spec.ts).
 */
export type AccessRule =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permissions'; permissions: Permission[] };

/** Anonymous access. Only for the login, health and public showcase routes. */
export const Public = () => SetMetadata<string, AccessRule>(ACCESS_KEY, { kind: 'public' });

/** Any signed-in user, whatever the role. The service must scope data to that user. */
export const Authenticated = () => SetMetadata<string, AccessRule>(ACCESS_KEY, { kind: 'authenticated' });

/** Signed-in user holding ALL the listed permissions. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata<string, AccessRule>(ACCESS_KEY, { kind: 'permissions', permissions });

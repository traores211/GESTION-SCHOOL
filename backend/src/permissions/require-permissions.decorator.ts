import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from './catalog';

export const REQUIRE_PERMISSIONS_KEY = 'required-permissions';

/**
 * Attaches a list of required fine-grained permissions to a route or a controller. Checked by
 * `PermissionsGuard` (which must run after `JwtAuthGuard`). A user whose role implies the
 * permission is let through without any explicit grant; others must have ALL of the listed
 * permissions in the DB.
 *
 * Example: `@RequirePermissions('billing:refund')` on a POST /payments/:id/refund route.
 */
export const RequirePermissions = (...keys: PermissionKey[]) => SetMetadata(REQUIRE_PERMISSIONS_KEY, keys);

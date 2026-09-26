/**
 * Single source of truth for "who may do what" inside a school (tenant).
 *
 * Controllers declare the permission a route needs (@RequirePermissions), services use
 * `can()` for field-level decisions (e.g. salaries), and the future AI agent will filter the
 * tools it exposes with the very same function — so a capability can never be granted to the
 * assistant without being granted to the user. See docs/architecture/architecture-cible.md §4.
 */
export const PERMISSIONS = [
  'dashboard:read',
  'students:read',
  'students:write',
  'students:delete',
  'parents:read',
  'parents:write',
  'staff:read',
  'staff:write',
  'classes:read',
  'classes:write',
  'academic:read',
  'academic:write',
  'admissions:read',
  'admissions:write',
  'attendance:read',
  'attendance:write',
  'grades:read',
  'grades:write',
  'billing:read',
  'billing:write',
  'payroll:read',
  'payroll:write',
  'transport:read',
  'transport:write',
  'announcements:read',
  'announcements:write',
  'parent-portal:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS.filter((p) => p !== 'parent-portal:read');

/**
 * Derived from what each role actually uses today (menu entries in frontend Shell.tsx and the
 * API calls each of those pages makes), so locking routes down does not break a screen.
 */
export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  SUPER_ADMIN: ALL,
  ADMIN_ORGANISATION: ALL,
  DIRECTOR: ALL,
  SECRETARY: [
    'dashboard:read',
    'students:read',
    'students:write',
    'parents:read',
    'parents:write',
    'staff:read',
    'classes:read',
    'classes:write',
    'academic:read',
    'admissions:read',
    'admissions:write',
    'attendance:read',
    'attendance:write',
    'grades:read',
    'billing:read',
    'billing:write',
    'transport:read',
    'transport:write',
  ],
  COMPTABLE: [
    'dashboard:read',
    'students:read',
    'staff:read',
    'classes:read',
    'academic:read',
    'billing:read',
    'billing:write',
    'payroll:read',
    'payroll:write',
  ],
  ENSEIGNANT: [
    'dashboard:read',
    'students:read',
    'staff:read',
    'classes:read',
    'academic:read',
    'attendance:read',
    'attendance:write',
    'grades:read',
    'grades:write',
  ],
  PARENT: ['parent-portal:read'],
  ELEVE: [],
};

export function permissionsForRole(role: string | null | undefined): readonly Permission[] {
  return (role && ROLE_PERMISSIONS[role]) || [];
}

export function can(principal: { role: string } | null | undefined, permission: Permission): boolean {
  return permissionsForRole(principal?.role).includes(permission);
}

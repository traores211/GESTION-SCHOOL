/**
 * Role groups used by @Roles() on controllers. They mirror the sidebar menu of the frontend
 * (components/Shell.tsx): the menu only hides entries, these groups are what actually protects the API.
 */
export const MANAGEMENT = ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR'] as const;
export const OFFICE = [...MANAGEMENT, 'SECRETARY'] as const;
export const FINANCE = [...MANAGEMENT, 'COMPTABLE'] as const;
export const TEACHING = [...OFFICE, 'ENSEIGNANT'] as const;
export const ALL_STAFF = [...TEACHING, 'COMPTABLE'] as const;

import { PERMISSION_GROUP_LABELS, PERMISSION_KEYS, findPermission, isPermissionKey, roleImpliesPermission } from './catalog';

describe('permissions catalog', () => {
  it('ships at least a dozen permissions grouped by domain', () => {
    expect(PERMISSION_KEYS.length).toBeGreaterThanOrEqual(12);
    expect(Object.keys(PERMISSION_GROUP_LABELS).sort()).toEqual(['administration', 'communication', 'finances', 'scolarite', 'vie-scolaire']);
  });

  it('keys are of the shape "<resource>:<action>" and unique', () => {
    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z-]+:[a-z-]+$/);
    }
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it('findPermission returns the full entry', () => {
    const p = findPermission('privacy:erase');
    expect(p?.resource).toBe('privacy');
    expect(p?.action).toBe('erase');
    expect(p?.impliedByRoles).toContain('DIRECTOR');
  });

  it('isPermissionKey tells known keys from unknown ones', () => {
    expect(isPermissionKey('billing:refund')).toBe(true);
    expect(isPermissionKey('made:up')).toBe(false);
    expect(isPermissionKey(42)).toBe(false);
  });

  it('every implied role is a real UserRole value (hard-coded list copy)', () => {
    const KNOWN_ROLES = ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR', 'SECRETARY', 'COMPTABLE', 'ENSEIGNANT', 'SURVEILLANT', 'EDUCATEUR', 'ELEVE', 'PARENT'];
    for (const key of PERMISSION_KEYS) {
      const perm = findPermission(key)!;
      for (const role of perm.impliedByRoles ?? []) {
        expect(KNOWN_ROLES).toContain(role);
      }
    }
  });
});

describe('roleImpliesPermission', () => {
  it('DIRECTOR implies privacy:erase (role catalog says so)', () => {
    expect(roleImpliesPermission('DIRECTOR', 'privacy:erase')).toBe(true);
  });
  it('ENSEIGNANT does not imply privacy:erase', () => {
    expect(roleImpliesPermission('ENSEIGNANT', 'privacy:erase')).toBe(false);
  });
  it('a role missing from the catalog implies nothing', () => {
    expect(roleImpliesPermission('UNKNOWN', 'billing:refund')).toBe(false);
  });
});

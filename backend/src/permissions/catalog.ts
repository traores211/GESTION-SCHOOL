/**
 * Catalogue of fine-grained permissions. Each entry is of the shape "<resource>:<action>".
 * The role-based access check (RolesGuard) stays the authority: a user with the role that
 * covers a method is let through without needing an explicit permission. The permissions
 * layer is additive — it lets the editor hand a specific capability to a user outside their
 * usual role (e.g. a secretary allowed to send bulk SMS) or restrict a role (e.g. a teacher
 * disallowed from exporting marks).
 *
 * Keep this list in sync with the controllers that use `@RequirePermissions(...)`.
 */

export interface PermissionDefinition {
  /** Short id "<resource>:<action>" used in @RequirePermissions and in the DB. */
  key: string;
  resource: string;
  action: string;
  /** Short human-readable label (FR), shown in the picker. */
  label: string;
  /** Longer explanation (FR), shown as a tooltip / help text. */
  description: string;
  /** Grouped tabs in the UI. */
  group: 'scolarite' | 'vie-scolaire' | 'finances' | 'communication' | 'administration';
  /** Roles that already hold the capability through their role: no need to grant it explicitly. */
  impliedByRoles?: string[];
}

export const PERMISSIONS = [
  // ------------------------------------------------------------------ Scolarité
  {
    key: 'students:export',
    resource: 'students',
    action: 'export',
    label: 'Exporter la liste des élèves',
    description: "Télécharger les listes d'élèves (Excel, CSV) de l'établissement.",
    group: 'scolarite',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR', 'SECRETARY'],
  },
  {
    key: 'students:archive',
    resource: 'students',
    action: 'archive',
    label: "Archiver un dossier d'élève",
    description: "Déplacer un élève vers les dossiers archivés (son historique est préservé).",
    group: 'scolarite',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR'],
  },
  {
    key: 'grades:validate',
    resource: 'grades',
    action: 'validate',
    label: 'Valider un bulletin',
    description: "Clôturer les notes d'un trimestre et déclencher la génération du bulletin.",
    group: 'scolarite',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR'],
  },
  {
    key: 'grades:export',
    resource: 'grades',
    action: 'export',
    label: 'Exporter les notes',
    description: "Télécharger les notes d'une classe ou d'une matière (Excel, CSV, PDF).",
    group: 'scolarite',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR', 'SECRETARY', 'ENSEIGNANT'],
  },

  // ------------------------------------------------------------------ Vie scolaire
  {
    key: 'discipline:write',
    resource: 'discipline',
    action: 'write',
    label: 'Rédiger un dossier de discipline',
    description: "Créer des observations, avertissements, retenues et autres sanctions.",
    group: 'vie-scolaire',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR', 'SECRETARY', 'SURVEILLANT', 'EDUCATEUR'],
  },
  {
    key: 'gate:override',
    resource: 'gate',
    action: 'override',
    label: 'Forcer une entrée / sortie',
    description: "Valider un passage manuel au portail sans carte QR (visiteur, oubli).",
    group: 'vie-scolaire',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR', 'SECRETARY', 'SURVEILLANT', 'EDUCATEUR'],
  },

  // ------------------------------------------------------------------ Finances
  {
    key: 'billing:write',
    resource: 'billing',
    action: 'write',
    label: 'Émettre et modifier des factures',
    description: "Créer, modifier et annuler les factures de scolarité et de transport.",
    group: 'finances',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR', 'COMPTABLE'],
  },
  {
    key: 'billing:refund',
    resource: 'billing',
    action: 'refund',
    label: 'Rembourser un paiement',
    description: "Marquer un paiement comme remboursé (la ligne reste visible dans le journal).",
    group: 'finances',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR', 'COMPTABLE'],
  },
  {
    key: 'payroll:validate',
    resource: 'payroll',
    action: 'validate',
    label: 'Valider la paie',
    description: "Passer les bulletins de paie du statut Brouillon à Validé puis Payé.",
    group: 'finances',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR', 'COMPTABLE'],
  },

  // ------------------------------------------------------------------ Communication
  {
    key: 'messaging:broadcast',
    resource: 'messaging',
    action: 'broadcast',
    label: 'Envoyer un message groupé',
    description: "Envoyer un SMS, WhatsApp ou e-mail à une classe ou à toute l'école en une opération.",
    group: 'communication',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR'],
  },
  {
    key: 'announcements:publish',
    resource: 'announcements',
    action: 'publish',
    label: 'Publier une annonce',
    description: "Rendre une annonce visible sur la vitrine publique de l'école.",
    group: 'communication',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR'],
  },
  {
    key: 'showcase:publish',
    resource: 'showcase',
    action: 'publish',
    label: 'Publier la vitrine',
    description: "Publier les modifications de la vitrine publique (brouillon → en ligne).",
    group: 'communication',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR'],
  },

  // ------------------------------------------------------------------ Administration
  {
    key: 'users:create',
    resource: 'users',
    action: 'create',
    label: 'Créer un compte',
    description: "Ajouter un compte (personnel, parent, élève) à l'établissement.",
    group: 'administration',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR'],
  },
  {
    key: 'users:permissions',
    resource: 'users',
    action: 'permissions',
    label: 'Modifier les permissions',
    description: "Accorder ou retirer les permissions fines des comptes de l'établissement.",
    group: 'administration',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION'],
  },
  {
    key: 'audit:read',
    resource: 'audit',
    action: 'read',
    label: "Consulter le journal d'audit",
    description: "Ouvrir le journal des actions sensibles de l'établissement.",
    group: 'administration',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR'],
  },
  {
    key: 'privacy:export',
    resource: 'privacy',
    action: 'export',
    label: 'Exporter les données personnelles',
    description: "Télécharger les archives RGPD d'un élève ou de l'établissement entier.",
    group: 'administration',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR'],
  },
  {
    key: 'privacy:erase',
    resource: 'privacy',
    action: 'erase',
    label: 'Anonymiser un dossier',
    description: "Effacer l'identité d'un élève archivé (les données scolaires sont conservées).",
    group: 'administration',
    impliedByRoles: ['SUPER_ADMIN', 'ADMIN_ORGANISATION', 'DIRECTOR'],
  },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((p) => p.key);

export function findPermission(key: string): PermissionDefinition | undefined {
  return PERMISSIONS.find((p) => p.key === key);
}

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && PERMISSION_KEYS.includes(value as PermissionKey);
}

/** True when the role already grants this permission by itself (no explicit grant required). */
export function roleImpliesPermission(role: string, key: PermissionKey): boolean {
  const perm = findPermission(key);
  return perm?.impliedByRoles?.includes(role) ?? false;
}

export const PERMISSION_GROUP_LABELS: Record<PermissionDefinition['group'], string> = {
  scolarite: 'Scolarité',
  'vie-scolaire': 'Vie scolaire',
  finances: 'Finances',
  communication: 'Communication',
  administration: 'Administration',
};

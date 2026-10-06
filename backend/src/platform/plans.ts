/**
 * SaaS plans and their quotas. Keeping the defaults in code (not in DB) means a new price plan
 * ships in a release, not through a manual seed. Per-organisation overrides live in the
 * `OrganisationQuotaOverride` table so the editor can grant extra capacity to a given customer
 * without touching the baseline.
 */

export const PLAN_IDS = ['STARTER', 'PRO', 'ENTERPRISE'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

/** Every quota the platform knows about. Null in a plan = unlimited. */
export interface PlanQuotas {
  /** Maximum enrolled pupils (archived pupils are not counted). */
  students: number | null;
  /** Maximum staff accounts (teachers, secretaries, directors) — pupils and parents are not counted. */
  staffUsers: number | null;
  /** Maximum classes across the active school year. */
  classes: number | null;
  /** Maximum schools the organisation may open (one group = several schools). */
  schools: number | null;
  /** Maximum custom domains (SchoolDomain) added across the group — the auto subdomain is free. */
  customDomains: number | null;
  /** Maximum storage used by uploaded documents and showcase assets, in megabytes. */
  storageMb: number | null;
  /** Maximum SMS / WhatsApp message segments per calendar month. */
  smsMonthly: number | null;
}

/** Boolean feature flags carried by a plan. */
export interface PlanFeatures {
  /** The AI assistant endpoints (Dify, OCR) are available. */
  ai: boolean;
  /** The showcase (public page of each school) can be customised with the full content model. */
  advancedShowcase: boolean;
  /** The analytics dashboards (insights) are open. */
  advancedAnalytics: boolean;
}

export interface Plan {
  id: PlanId;
  label: string;
  /** Short tagline shown on the plan picker. */
  tagline: string;
  quotas: PlanQuotas;
  features: PlanFeatures;
}

/**
 * Baseline plans. Numbers reflect a realistic small-to-mid Ivorian school; the editor can tune
 * them for a given customer by writing an override row.
 */
export const PLANS: Record<PlanId, Plan> = {
  STARTER: {
    id: 'STARTER',
    label: 'Starter',
    tagline: "Petit établissement, un site, l'essentiel",
    quotas: {
      students: 300,
      staffUsers: 25,
      classes: 15,
      schools: 1,
      customDomains: 0, // only the auto subdomain
      storageMb: 1024, // 1 Gb
      smsMonthly: 500,
    },
    features: { ai: false, advancedShowcase: false, advancedAnalytics: false },
  },
  PRO: {
    id: 'PRO',
    label: 'Pro',
    tagline: 'Établissement établi, vitrine complète, un domaine à soi',
    quotas: {
      students: 1500,
      staffUsers: 100,
      classes: 60,
      schools: 1,
      customDomains: 1,
      storageMb: 10240, // 10 Gb
      smsMonthly: 3000,
    },
    features: { ai: true, advancedShowcase: true, advancedAnalytics: false },
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    label: 'Entreprise',
    tagline: 'Groupe scolaire multi-sites, sans plafond strict',
    quotas: {
      students: null,
      staffUsers: null,
      classes: null,
      schools: null,
      customDomains: 10,
      storageMb: null,
      smsMonthly: null,
    },
    features: { ai: true, advancedShowcase: true, advancedAnalytics: true },
  },
};

/** Fallback used when an organisation points at an unknown plan (never lock it out). */
export function planOf(planId: string | null | undefined): Plan {
  return isPlanId(planId) ? PLANS[planId] : PLANS.STARTER;
}

/**
 * Merges per-organisation overrides on top of the plan defaults. An override of `null` means
 * "keep the baseline"; a number (including 0) wins.
 */
export function effectiveQuotas(planId: string | null | undefined, overrides?: Partial<Record<keyof PlanQuotas, number | null>> | null): PlanQuotas {
  const base = planOf(planId).quotas;
  if (!overrides) return base;
  const merged: PlanQuotas = { ...base };
  for (const key of Object.keys(base) as (keyof PlanQuotas)[]) {
    const value = overrides[key];
    if (value !== undefined && value !== null) merged[key] = value;
  }
  return merged;
}

/** True when the resource is capped (null = unlimited). */
export function isLimited(quota: number | null): quota is number {
  return typeof quota === 'number';
}

/** Keys of the quotas object, for iteration (iterable but still typed). */
export const QUOTA_KEYS = ['students', 'staffUsers', 'classes', 'schools', 'customDomains', 'storageMb', 'smsMonthly'] as const satisfies readonly (keyof PlanQuotas)[];
export type QuotaKey = (typeof QUOTA_KEYS)[number];

/** Human-readable name of each quota (for errors shown to the back office). */
export const QUOTA_LABELS: Record<QuotaKey, string> = {
  students: "Nombre d'élèves",
  staffUsers: 'Nombre de comptes du personnel',
  classes: 'Nombre de classes',
  schools: "Nombre d'établissements",
  customDomains: 'Nombre de domaines personnalisés',
  storageMb: 'Stockage (Mo)',
  smsMonthly: 'SMS par mois',
};

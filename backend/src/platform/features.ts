/**
 * Feature flags per SaaS plan, with per-school overrides (School.featureOverrides).
 * A disabled feature answers 404 (the module "does not exist" for that school).
 */
export const FEATURES = [
  'showcase',
  'showcase.customDomain',
  'payroll',
  'transport',
  'timetable',
  'documents',
  'ai.chat',
  'ai.views',
] as const;

export type Feature = (typeof FEATURES)[number];
export type Plan = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export const PLAN_FEATURES: Record<Plan, readonly Feature[]> = {
  STARTER: ['showcase', 'documents'],
  PROFESSIONAL: ['showcase', 'showcase.customDomain', 'payroll', 'transport', 'timetable', 'documents', 'ai.chat'],
  ENTERPRISE: FEATURES,
};

export function isFeatureEnabled(
  school: { plan: string; featureOverrides?: unknown } | null | undefined,
  feature: Feature,
): boolean {
  if (!school) return false;
  const overrides = (school.featureOverrides ?? {}) as Record<string, unknown>;
  if (typeof overrides[feature] === 'boolean') return overrides[feature] as boolean;
  return (PLAN_FEATURES[school.plan as Plan] ?? []).includes(feature);
}

export function enabledFeatures(school: { plan: string; featureOverrides?: unknown } | null | undefined): Feature[] {
  return FEATURES.filter((f) => isFeatureEnabled(school, f));
}

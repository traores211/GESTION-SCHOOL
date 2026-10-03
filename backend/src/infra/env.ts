/**
 * Startup configuration check. In production the API refuses to start with missing secrets or with
 * the development defaults found in docker-compose.yml, so a "default" install cannot be attacked.
 */
const KNOWN_DEFAULTS = ['your-secret-key-change-in-production', 'dev-secret', 'SchoolAdmin123!', 'LdapAdmin123!', 'changeme', 'secret'];

export function validateEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  if (env.NODE_ENV !== 'production') return problems;
  const jwt = env.JWT_SECRET ?? '';
  if (jwt.length < 32) problems.push('JWT_SECRET doit faire au moins 32 caractères');
  if (KNOWN_DEFAULTS.some((d) => jwt === d)) problems.push('JWT_SECRET utilise une valeur par défaut');
  const db = env.DATABASE_URL ?? '';
  if (!db) problems.push('DATABASE_URL est obligatoire');
  if (KNOWN_DEFAULTS.some((d) => db.includes(`:${encodeURIComponent(d)}@`) || db.includes(`:${d}@`))) {
    problems.push('Le mot de passe de la base de données est une valeur par défaut');
  }
  if (!env.FRONTEND_URL || /localhost/.test(env.FRONTEND_URL)) problems.push("FRONTEND_URL doit être l'adresse publique du site (https://…)");
  for (const key of ['JWT_SECRET', 'DATABASE_URL', 'DATA_ENCRYPTION_KEY', 'REDIS_URL']) {
    if (/remplacer/i.test(env[key] ?? '')) problems.push(`${key} contient encore la valeur d'exemple de .env.production.example`);
  }
  if (env.DATA_ENCRYPTION_KEY !== undefined && Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64').length !== 32) {
    problems.push('DATA_ENCRYPTION_KEY doit faire exactement 32 octets encodés en base64 (openssl rand -base64 32)');
  }
  return problems;
}

export function assertEnv() {
  const problems = validateEnv();
  if (problems.length) {
    throw new Error(`Configuration de production invalide :\n - ${problems.join('\n - ')}`);
  }
}

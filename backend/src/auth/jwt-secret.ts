import { Logger } from '@nestjs/common';

// Placeholder values shipped in .env.example / docker-compose.yml.
const KNOWN_PLACEHOLDERS = ['dev-secret', 'your-secret-key-change-in-production'];

/**
 * Read lazily (not at import time) so values loaded by ConfigModule from .env.local are seen.
 * Refuses to start in production with a missing, short or placeholder secret.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  const weak =
    !secret ||
    secret.length < 32 ||
    KNOWN_PLACEHOLDERS.includes(secret) ||
    /change-in-production/i.test(secret);

  if (!weak) return secret as string;
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be a random value of at least 32 characters in production');
  }
  new Logger('Auth').warn('JWT_SECRET is missing or weak: acceptable for local development only');
  return secret || 'dev-only-insecure-jwt-secret';
}

import { resolveJwtSecret } from './jwt-secret';

describe('resolveJwtSecret', () => {
  const strong = 'k3Y9-random-value-with-more-than-32-characters';

  it('refuses to start in production without a secret', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow();
  });

  it('refuses the placeholders shipped in .env.example and docker-compose.yml in production', () => {
    for (const placeholder of [
      'your-secret-key-change-in-production',
      'your-super-secret-key-change-in-production-at-least-32-chars',
      'dev-secret',
    ]) {
      expect(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: placeholder })).toThrow();
    }
  });

  it('refuses a short secret in production', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow();
  });

  it('accepts a strong secret', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: strong })).toBe(strong);
  });

  it('tolerates a missing secret in development only', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'development' })).toBeTruthy();
  });
});

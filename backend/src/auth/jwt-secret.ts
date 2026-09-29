/** JWT signing secret. The development fallback is refused in production so tokens cannot be forged. */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set (16+ characters) when NODE_ENV=production');
  }
  return secret || 'dev-secret';
}

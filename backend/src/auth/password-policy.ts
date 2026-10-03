/** Password rules applied on creation, change and reset. */
const COMMON = new Set([
  'password',
  'motdepasse',
  'azerty123',
  'qwerty123',
  '123456789',
  '1234567890',
  'abidjan2024',
  'abidjan2025',
  'ecole12345',
  'admin12345',
  'password123',
  'motdepasse1',
]);

export const PASSWORD_RULES = '10 caractères minimum, avec au moins une lettre et un chiffre';

/** Null when the password is acceptable, otherwise the reason. */
export function passwordProblem(password: string, context: { email?: string; firstName?: string; lastName?: string } = {}): string | null {
  if (typeof password !== 'string' || password.length < 10) return `Mot de passe trop court (${PASSWORD_RULES})`;
  if (password.length > 128) return 'Mot de passe trop long (128 caractères maximum)';
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return `Mot de passe trop simple (${PASSWORD_RULES})`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'Ce mot de passe est trop courant';
  if (/^(.)\1+$/.test(password)) return 'Ce mot de passe est trop simple';
  const personal = [context.email?.split('@')[0], context.firstName, context.lastName].filter((v): v is string => !!v && v.length >= 3);
  if (personal.some((p) => lower.includes(p.toLowerCase()))) return 'Le mot de passe ne doit pas contenir votre nom ni votre identifiant';
  return null;
}

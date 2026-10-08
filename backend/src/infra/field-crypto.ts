import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Encryption at rest of sensitive columns (health information, two-factor secrets) with AES-256-GCM
 * and the DATA_ENCRYPTION_KEY (32 bytes, base64). A database dump or backup alone does not reveal
 * them. Values are stored as "enc:v1:<iv>:<tag>:<data>"; older plain values are still readable and
 * get encrypted the next time they are saved.
 */
const PREFIX = 'enc:v1:';

/** Columns encrypted transparently by the Prisma layer. */
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  Student: ['allergies', 'specialNeeds'],
  User: ['totpSecret'],
  Admission: ['interviewNotes'],
  Parent: ['idNumber'],
  StaffMember: ['bankAccount'],
};

export function loadKey(raw = process.env.DATA_ENCRYPTION_KEY): Buffer | null {
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

export const isEncrypted = (value: unknown): value is string => typeof value === 'string' && value.startsWith(PREFIX);

export function encryptValue(plain: string, key: Buffer): string {
  if (isEncrypted(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

/** Plain values pass through; a value that cannot be decrypted (wrong key, tampering) throws. */
export function decryptValue(stored: string, key: Buffer): string {
  if (!isEncrypted(stored)) return stored;
  const [iv, tag, data] = stored.slice(PREFIX.length).split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** Encrypts the sensitive fields of a Prisma `data` object (create, update, upsert parts), in place. */
export function encryptData(model: string, data: unknown, key: Buffer) {
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields || !data || typeof data !== 'object') return;
  for (const row of Array.isArray(data) ? data : [data]) {
    for (const field of fields) {
      const value = (row as Record<string, unknown>)[field];
      if (typeof value === 'string' && value) (row as Record<string, unknown>)[field] = encryptValue(value, key);
      else if (value && typeof value === 'object' && typeof (value as { set?: unknown }).set === 'string' && (value as { set: string }).set) {
        (value as { set: string }).set = encryptValue((value as { set: string }).set, key);
      }
    }
  }
}

/** Decrypts every encrypted string found in a query result, whatever the nesting (includes, lists). */
export function decryptResult<T>(result: T, key: Buffer): T {
  if (isEncrypted(result)) {
    try {
      return decryptValue(result, key) as unknown as T;
    } catch {
      // Wrong key or damaged value: never leak the cipher text to the screens.
      return null as unknown as T;
    }
  }
  if (Array.isArray(result)) {
    for (let i = 0; i < result.length; i++) result[i] = decryptResult(result[i], key);
    return result;
  }
  if (result && typeof result === 'object' && !(result instanceof Date) && !Buffer.isBuffer(result)) {
    const row = result as Record<string, unknown>;
    for (const k of Object.keys(row)) {
      const v = row[k];
      if (typeof v === 'string' ? isEncrypted(v) : v && typeof v === 'object') row[k] = decryptResult(v, key);
    }
  }
  return result;
}

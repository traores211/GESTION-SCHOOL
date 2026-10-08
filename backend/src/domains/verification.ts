import { randomBytes } from 'crypto';
import { promises as dns } from 'dns';

/**
 * The TXT record a school owner must publish to prove they control the domain. We ask for a
 * dedicated subdomain so publishing it does not interfere with their own records.
 */
export function verificationRecordName(hostname: string): string {
  return `_school-verify.${hostname}`;
}

/** 32 random bytes, URL-safe base64, prefix-identifiable so a human recognises it in a DNS console. */
export function generateVerificationToken(): string {
  return 'erp-verify-' + randomBytes(24).toString('base64url');
}

export interface DnsCheckResult {
  ok: boolean;
  foundTokens: string[];
  error?: string;
}

/**
 * Looks up the TXT records of `_school-verify.<hostname>` and tells whether `expectedToken` is
 * among them. Doesn't throw: a lookup failure (NXDOMAIN, timeout) returns `ok: false` with the
 * reason, so the caller can show it as-is.
 */
export async function checkDnsVerification(hostname: string, expectedToken: string, resolver?: Pick<typeof dns, 'resolveTxt'>): Promise<DnsCheckResult> {
  const record = verificationRecordName(hostname);
  try {
    const txt = await (resolver ?? dns).resolveTxt(record);
    // Each TXT record is an array of strings (chunks of ≤ 255 chars); we join each record.
    const tokens = txt.map((chunks) => chunks.join('')).map((s) => s.trim()).filter(Boolean);
    const ok = tokens.includes(expectedToken);
    return { ok, foundTokens: tokens };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message = code === 'ENOTFOUND' || code === 'ENODATA'
      ? `Aucun enregistrement TXT trouvé pour ${record}`
      : `Erreur DNS : ${code || (err as Error).message}`;
    return { ok: false, foundTokens: [], error: message };
  }
}

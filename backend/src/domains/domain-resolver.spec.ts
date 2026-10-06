import { cleanHostname } from './domain-resolver.service';
import { checkDnsVerification, generateVerificationToken, verificationRecordName } from './verification';

describe('cleanHostname', () => {
  it('trims, lowercases and strips the port', () => {
    expect(cleanHostname(' Mon-Ecole-1.CI:4443 ')).toBe('mon-ecole-1.ci');
  });

  it('keeps the first host when several are present (behind a proxy)', () => {
    expect(cleanHostname('mon-ecole-1.ci, badguy.example')).toBe('mon-ecole-1.ci');
  });

  it('rejects paths, schemes, and invalid characters', () => {
    expect(cleanHostname('https://mon-ecole-1.ci')).toBeNull();
    expect(cleanHostname('mon-ecole-1.ci/path')).toBeNull();
    expect(cleanHostname('mon ecole.ci')).toBeNull();
  });

  it('rejects empty, null and very long hostnames', () => {
    expect(cleanHostname(null)).toBeNull();
    expect(cleanHostname('')).toBeNull();
    expect(cleanHostname('a'.repeat(254))).toBeNull();
  });

  it('accepts single-label hosts (localhost) and IPs', () => {
    expect(cleanHostname('localhost')).toBe('localhost');
    expect(cleanHostname('127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('verification token', () => {
  it('generates a URL-safe prefixed token of a stable length', () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^erp-verify-[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThan(20);
  });

  it('builds a dedicated verification subdomain so the parent zone is untouched', () => {
    expect(verificationRecordName('mon-ecole-1.ci')).toBe('_school-verify.mon-ecole-1.ci');
  });
});

describe('checkDnsVerification', () => {
  const token = 'erp-verify-expected';
  const makeResolver = (records: string[][] | Error) => ({
    resolveTxt: async () => {
      if (records instanceof Error) throw records;
      return records;
    },
  });

  it('passes when the expected token is published', async () => {
    const res = await checkDnsVerification('mon-ecole-1.ci', token, makeResolver([[token]]));
    expect(res).toEqual({ ok: true, foundTokens: [token] });
  });

  it('passes when the token is split across TXT chunks (DNS 255-char limit)', async () => {
    const res = await checkDnsVerification('mon-ecole-1.ci', token, makeResolver([['erp-verify-', 'expected']]));
    expect(res.ok).toBe(true);
  });

  it('fails when a different token is published', async () => {
    const res = await checkDnsVerification('mon-ecole-1.ci', token, makeResolver([['something-else']]));
    expect(res.ok).toBe(false);
    expect(res.foundTokens).toEqual(['something-else']);
  });

  it('fails cleanly when the record does not exist', async () => {
    const err = Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
    const res = await checkDnsVerification('mon-ecole-1.ci', token, makeResolver(err));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Aucun enregistrement TXT/);
  });
});

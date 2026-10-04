import { createPublicKey, verify } from 'crypto';
import { generateVapidKeys, isAllowedEndpoint, pushHeaders, validVapidKeys, vapidToken } from './push-vapid';

describe('web push (VAPID)', () => {
  const keys = generateVapidKeys();
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';

  it('generates a usable P-256 key pair', () => {
    expect(validVapidKeys(keys)).toBe(true);
    expect(Buffer.from(keys.publicKey, 'base64url')).toHaveLength(65);
    expect(validVapidKeys({ publicKey: keys.publicKey })).toBe(false);
    expect(validVapidKeys({ publicKey: 'abc', privateKey: 'def' })).toBe(false);
  });

  it('signs a token the push service can verify with the public key', () => {
    const now = Date.UTC(2026, 9, 4, 12, 0, 0);
    const token = vapidToken(endpoint, keys, 'mailto:contact@ecole.ci', now);
    const [header, payload, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({ aud: 'https://fcm.googleapis.com', exp: Math.floor(now / 1000) + 12 * 3600, sub: 'mailto:contact@ecole.ci' });
    const point = Buffer.from(keys.publicKey, 'base64url');
    const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33, 65).toString('base64url') } });
    expect(verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
    expect(verify('sha256', Buffer.from(`${header}.${payload}x`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(false);
  });

  it('sends no content: an empty request with the token and the public key', () => {
    const headers = pushHeaders(endpoint, keys, 'mailto:contact@ecole.ci');
    expect(headers['Content-Length']).toBe('0');
    expect(headers.TTL).toBe('86400');
    expect(headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${keys.publicKey}$`));
  });

  it('accepts the push services of the browsers only', () => {
    expect(isAllowedEndpoint('https://fcm.googleapis.com/fcm/send/x', '')).toBe(true);
    expect(isAllowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x', '')).toBe(true);
    expect(isAllowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x', '')).toBe(true);
    expect(isAllowedEndpoint('https://web.push.apple.com/x', '')).toBe(true);
    expect(isAllowedEndpoint('http://fcm.googleapis.com/fcm/send/x', '')).toBe(false);
    expect(isAllowedEndpoint('https://fcm.googleapis.com.evil.example/x', '')).toBe(false);
    expect(isAllowedEndpoint('https://169.254.169.254/latest/meta-data', '')).toBe(false);
    expect(isAllowedEndpoint('http://localhost:5432/', '')).toBe(false);
    expect(isAllowedEndpoint('pas une adresse', '')).toBe(false);
  });

  it('accepts an extra host only when the configuration names it', () => {
    expect(isAllowedEndpoint('http://localhost:9999/push', 'localhost:9999')).toBe(true);
    expect(isAllowedEndpoint('http://localhost:9998/push', 'localhost:9999')).toBe(false);
  });
});

import { createPrivateKey, generateKeyPairSync, sign } from 'crypto';

/**
 * Web Push without a payload: the push service is asked to wake the browser, which then shows a
 * generic "you have a new notification" message. No content of a notification ever leaves the server,
 * so nothing has to be encrypted; the request is authenticated with VAPID (RFC 8292), signed here with
 * Node's own crypto. Pure functions: no network, tested on their own.
 */
const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');

/** Push services of the browsers; a subscription pointing anywhere else is refused (no request to arbitrary hosts). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

/** Extra hosts allowed by configuration (tests, a self-hosted push service): "host:port,host". */
export function isAllowedEndpoint(endpoint: string, extraHosts = process.env.PUSH_ALLOWED_HOSTS ?? ''): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  const extra = extraHosts.split(',').map((h) => h.trim()).filter(Boolean);
  if (extra.includes(url.host)) return url.protocol === 'https:' || url.protocol === 'http:';
  return url.protocol === 'https:' && PUSH_HOSTS.some((h) => h.test(url.hostname));
}

export interface VapidKeys {
  /** Uncompressed P-256 point, base64url (what the browser receives as applicationServerKey) */
  publicKey: string;
  /** Private scalar, base64url */
  privateKey: string;
}

/** A new key pair, to put in VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY once and keep. */
export function generateVapidKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' }) as { x: string; y: string; d: string };
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  return { publicKey: b64url(point), privateKey: jwk.d };
}

/** True when the two keys are a usable P-256 pair. */
export function validVapidKeys(keys: Partial<VapidKeys>): keys is VapidKeys {
  if (!keys.publicKey || !keys.privateKey) return false;
  const point = Buffer.from(keys.publicKey, 'base64url');
  return point.length === 65 && point[0] === 4 && Buffer.from(keys.privateKey, 'base64url').length === 32;
}

/** The signed token a push service checks: who sends (sub), to which service (aud), until when (exp). */
export function vapidToken(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const point = Buffer.from(keys.publicKey, 'base64url');
  const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64url(point.subarray(1, 33)), y: b64url(point.subarray(33, 65)) } });
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64url(signature)}`;
}

/** Headers of a payload-less push request. */
export function pushHeaders(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Record<string, string> {
  return { TTL: '86400', Urgency: 'normal', 'Content-Length': '0', Authorization: `vapid t=${vapidToken(endpoint, keys, subject, now)}, k=${keys.publicKey}` };
}

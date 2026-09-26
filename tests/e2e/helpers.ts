import { APIRequestContext, expect, Page, request } from '@playwright/test';
import { createHmac } from 'crypto';
import { execFileSync } from 'child_process';

export const API = process.env.RECETTE_API ?? 'http://localhost:14000/api';
export const WEB = process.env.RECETTE_WEB ?? 'http://localhost:13000';
/** Name of the acceptance database container (docker compose -p gs-recette). */
const DB_CONTAINER = process.env.RECETTE_DB_CONTAINER ?? 'gs-recette-db-1';

/** Seeded acceptance accounts (docs/testing/cahier-recettes.md §2). */
export const ACCOUNTS = {
  platform: ['platform@gestion.school', 'platform123'],
  director: ['directeur@school.local', 'direct123'],
  director2: ['directeur@horizon.local', 'horizon123'],
  teacher: ['k.kouassi@school.local', 'teach123'],
  teacherFr: ['y.diallo@school.local', 'teach123'],
  secretary: ['secretaire@school.local', 'secret123'],
  accountant: ['comptable@school.local', 'compta123'],
  parent: ['parent@school.local', 'parent123'],
  student: ['eleve@school.local', 'eleve123'],
} as const;
export type Account = keyof typeof ACCOUNTS;

const tokens = new Map<string, string>();

export async function login(who: Account): Promise<string> {
  if (tokens.has(who)) return tokens.get(who)!;
  const ctx = await request.newContext();
  const [email, password] = ACCOUNTS[who];
  const res = await ctx.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status(), `login ${who}`).toBe(200);
  const body = await res.json();
  tokens.set(who, body.accessToken);
  await ctx.dispose();
  return body.accessToken;
}

/** API client authenticated as a seeded account. */
export async function as(who: Account): Promise<APIRequestContext> {
  const token = await login(who);
  return request.newContext({ baseURL: `${API}/`, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

export async function anonymous(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: `${API}/` });
}

/** Logs a browser page in through the real login form. */
export async function uiLogin(page: Page, who: Account) {
  const [email, password] = ACCOUNTS[who];
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/(dashboard|portal|platform)/);
}

/** RFC 6238 TOTP, same algorithm as the backend (used to test MFA end to end). */
export function totp(secret: string, time = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of secret) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const h = createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Reads the simulated mailbox (outbox table) of the acceptance DB — acts as the test inbox. */
export function lastEmailBody(to: string): string {
  const safe = to.replace(/'/g, "''");
  return execFileSync('docker', [
    'exec',
    DB_CONTAINER,
    'psql',
    '-U',
    'gs',
    '-d',
    'gs_recette',
    '-tAc',
    `SELECT body FROM "OutboundMessage" WHERE "to" = '${safe}' ORDER BY "createdAt" DESC LIMIT 1`,
  ])
    .toString()
    .trim();
}

export const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

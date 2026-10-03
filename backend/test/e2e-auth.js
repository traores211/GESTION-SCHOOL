/* End-to-end check of authentication: refresh rotation and reuse detection, logout, password reset
 * by e-mail (read from MailHog), two-factor authentication, sign-out everywhere.
 * Usage (inside the backend container): node test/e2e-auth.js
 */
const { PrismaClient } = require('@prisma/client');
const { generate } = require('otplib');

const BASE = process.argv[2] || 'http://localhost:4000/api';
const MAILHOG = process.env.MAILHOG_URL || 'http://mailhog:8025';
const prisma = new PrismaClient();
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : '');
  }
};

const cookieOf = (res) => (res.headers.get('set-cookie') || '').match(/erp_refresh=([^;]*)/)?.[1] ?? null;
const post = (path, body, { token, cookie } = {}) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: `erp_refresh=${cookie}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const get = (path, token) => fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });

(async () => {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@school.local' } });
  const secretary = await prisma.user.findUnique({ where: { email: 'secretaire@school.local' } });
  const saved = { admin: admin.password, secretary: secretary.password };

  try {
    console.log('Sign-in and refresh rotation');
    const login = await post('/auth/login', { email: 'admin@school.local', password: 'admin123' });
    const body = await login.json();
    const c1 = cookieOf(login);
    ok(login.status === 200 && body.accessToken && c1, 'access token in the body, refresh token in a cookie');
    ok(/HttpOnly/i.test(login.headers.get('set-cookie')) && /Path=\/api\/auth/i.test(login.headers.get('set-cookie')), 'cookie is HttpOnly and limited to /api/auth');
    const me = await (await get('/auth/me', body.accessToken)).json();
    ok(me.sessions?.length >= 1 && me.totpRecommended === true, `profile with ${me.sessions?.length} session(s), 2FA recommended for the director`);
    const r1 = await post('/auth/refresh', null, { cookie: c1 });
    const c2 = cookieOf(r1);
    ok(r1.status === 200 && c2 && c2 !== c1, 'refresh rotates the cookie');
    const reuse = await post('/auth/refresh', null, { cookie: c1 });
    ok(reuse.status === 401, 'reusing a rotated refresh token is refused');
    ok((await post('/auth/refresh', null, { cookie: c2 })).status === 401, '…and revokes the whole family (the newer token too)');
    ok((await post('/auth/refresh')).status === 401, 'no cookie, no refresh');

    console.log('Logout');
    const l2 = await post('/auth/login', { email: 'admin@school.local', password: 'admin123' });
    const c3 = cookieOf(l2);
    await post('/auth/logout', null, { cookie: c3 });
    ok((await post('/auth/refresh', null, { cookie: c3 })).status === 401, 'refresh refused after logout');

    console.log('Password reset by e-mail');
    await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => undefined);
    const forgot = await post('/auth/forgot-password', { email: 'secretaire@school.local' });
    const unknown = await post('/auth/forgot-password', { email: 'personne@nulle-part.ci' });
    ok(forgot.status === 200 && unknown.status === 200 && (await forgot.json()).message === (await unknown.json()).message, 'same answer for known and unknown addresses');
    let link = null;
    for (let i = 0; i < 10 && !link; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const mails = await (await fetch(`${MAILHOG}/api/v2/messages`)).json().catch(() => null);
      const mail = mails?.items?.find((m) => m.Content.Headers.To?.[0]?.includes('secretaire@school.local'));
      const text = mail?.Content?.Body?.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
      link = text?.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1] ?? null;
    }
    ok(!!link, 'reset e-mail received with a one-time link');
    ok((await post('/auth/reset-password', { token: link, password: 'court' })).status === 400, 'weak password refused');
    const done = await post('/auth/reset-password', { token: link, password: 'Nouveau-Mot-2026' });
    ok(done.status === 200, 'password reset');
    ok((await post('/auth/reset-password', { token: link, password: 'Encore-Autre-2026' })).status === 400, 'the link works only once');
    ok((await post('/auth/login', { email: 'secretaire@school.local', password: 'secret123' })).status === 401, 'old password refused');
    ok((await post('/auth/login', { email: 'secretaire@school.local', password: 'Nouveau-Mot-2026' })).status === 200, 'new password accepted');

    console.log('Two-factor authentication');
    const l3 = await (await post('/auth/login', { email: 'admin@school.local', password: 'admin123' })).json();
    const setup = await (await post('/auth/2fa/setup', null, { token: l3.accessToken })).json();
    ok(setup.secret && setup.qr?.startsWith('data:image/png;base64,'), 'secret and QR code generated');
    ok((await post('/auth/2fa/enable', { code: '000000' }, { token: l3.accessToken })).status === 400, 'wrong code refused at activation');
    const now = Math.floor(Date.now() / 1000);
    const enable = await post('/auth/2fa/enable', { code: await generate({ secret: setup.secret, epoch: now }) }, { token: l3.accessToken });
    ok(enable.status === 200, '2FA enabled');
    const noCode = await post('/auth/login', { email: 'admin@school.local', password: 'admin123' });
    ok(noCode.status === 401 && (await noCode.json()).code === 'TOTP_REQUIRED', 'sign-in now asks for a code');
    const withCode = await post('/auth/login', { email: 'admin@school.local', password: 'admin123', totp: await generate({ secret: setup.secret, epoch: now + 30 }) });
    ok(withCode.status === 200, 'sign-in with the code');
    const admin2 = await withCode.json();
    // A code is accepted once, within one 30-second window of the current time. The two windows
    // above are used: take a third one that is still valid now, even if the clock moved to the next window.
    const window = (t) => Math.floor(t / 30);
    const used = [window(now), window(now + 30)];
    const current = Math.floor(Date.now() / 1000);
    const epoch = [current - 30, current + 30, current].find((t) => !used.includes(window(t)));
    const disable = await post('/auth/2fa/disable', { password: 'admin123', code: await generate({ secret: setup.secret, epoch }) }, { token: admin2.accessToken });
    ok(disable.status === 200, '2FA disabled with password + code');

    console.log('Sign out everywhere');
    const l4 = await (await post('/auth/login', { email: 'admin@school.local', password: 'admin123' })).json();
    ok((await get('/students', l4.accessToken)).status === 200, 'access token works');
    await new Promise((r) => setTimeout(r, 1100));
    await post('/auth/logout-all', null, { token: l4.accessToken });
    ok((await get('/students', l4.accessToken)).status === 401, 'the same access token is refused right after "sign out everywhere"');
  } finally {
    // Restore the demo accounts.
    await prisma.user.update({ where: { id: admin.id }, data: { password: saved.admin, totpEnabled: false, totpSecret: null, passwordChangedAt: null } });
    await prisma.user.update({ where: { id: secretary.id }, data: { password: saved.secretary, passwordChangedAt: null } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

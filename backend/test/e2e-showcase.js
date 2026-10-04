/* End-to-end check of the showcase: draft, preview, publication, contact form.
 * Runs in a school of its own (created by sign-up) so the demo showcase is left untouched.
 * Usage (inside the backend container or in CI): node test/e2e-showcase.js
 */
const { PrismaClient } = require('@prisma/client');
const { clearThrottle } = require('./throttle');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const MAILHOG = process.env.MAILHOG_URL || 'http://mailhog:8025';
const prisma = new PrismaClient();
const TAG = 'Test-Vitrine';
const HEAD = 'chef@test-vitrine.local';
const PASSWORD = 'Baobab-Lagune-2026!';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : '');
  }
};
const call = (method, path, body, token) =>
  fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const client = (token) => (method, path, body) => call(method, path, body, token);

const cleanup = async () => {
  const orgs = await prisma.organisation.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@test-vitrine.local' } } });
  await prisma.organisation.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
};

(async () => {
  await clearThrottle();
  try {
    await cleanup();
    const signup = await call('POST', '/public/signup', { schoolName: `${TAG} Lycée`, city: 'Bouaké', firstName: 'Awa', lastName: 'Chef', email: HEAD, password: PASSWORD, consent: true });
    ok(signup.status === 201, 'a school of its own for the scenario', signup.body);
    const code = signup.body.schoolCode;
    const head = client((await call('POST', '/auth/login', { email: HEAD, password: PASSWORD })).body.accessToken);
    const outsider = client((await call('POST', '/auth/login', { email: 'admin@school.local', password: 'admin123' })).body.accessToken);
    const secretary = client((await call('POST', '/auth/login', { email: 'secretaire@school.local', password: 'secret123' })).body.accessToken);
    const publicPage = () => call('GET', `/public/schools/${code}/showcase`);
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

    console.log('Who edits the showcase');
    ok((await head('GET', '/showcase/settings')).status === 200, 'the head who signed up (group administrator) edits the showcase of the school');
    ok((await secretary('GET', '/showcase/draft')).status === 403, 'the office does not');

    console.log('Draft');
    const draft = {
      tagline: 'Savoir, rigueur, excellence', primaryColor: '#0a7d3b', history: 'Fondé en 1998 par une équipe de professeurs.', values: 'Travail, respect, solidarité',
      directorName: 'Awa Chef', directorMessage: 'Bienvenue dans notre établissement.', openingHours: 'Du lundi au vendredi, 7h–17h', facilities: ['Bibliothèque', 'Laboratoire'], activities: ['Club théâtre'],
      events: [{ title: 'Journée portes ouvertes', date: soon, description: 'Visite des salles' }, { title: 'Ancienne fête', date: '2020-01-01' }], downloads: [{ label: 'Règlement intérieur', url: 'https://example.ci/reglement.pdf' }],
    };
    const saved = await head('PUT', '/showcase/draft', draft);
    ok(saved.status === 200 && saved.body.hasDraft === true && saved.body.draft.tagline === draft.tagline && saved.body.published.tagline !== draft.tagline, 'the changes are saved as a draft, beside what is published', saved.body);
    const still = await publicPage();
    ok(still.status === 200 && still.body.tagline !== draft.tagline && !still.body.content.history && still.body.preview === false, 'the public page does not change');
    ok((await head('PUT', '/showcase/draft', { primaryColor: 'vert' })).status === 400, 'a colour that is not a colour is refused');
    ok((await head('PUT', '/showcase/draft', { downloads: [{ label: 'Piège', url: 'javascript:alert(1)' }] })).status === 400, 'a download link that is not a web address is refused');
    ok((await head('PUT', '/showcase/draft', { isActive: false, organisationId: 'x' })).status === 400, 'fields that are not part of the showcase are refused');

    console.log('Preview');
    const preview = await head('GET', `/public/schools/${code}/showcase/preview`);
    ok(preview.status === 200 && preview.body.preview === true && preview.body.tagline === draft.tagline && preview.body.content.primaryColor === '#0a7d3b' && preview.body.content.facilities.length === 2, 'the management previews the page with the draft applied', preview.body && { tagline: preview.body.tagline, content: preview.body.content });
    ok(preview.body.content.events.length === 1 && preview.body.content.events[0].title === 'Journée portes ouvertes', 'past events are not shown');
    ok((await call('GET', `/public/schools/${code}/showcase/preview`)).status === 401, 'the preview is not public');
    ok((await outsider('GET', `/public/schools/${code}/showcase/preview`)).status === 404, 'nor open to another school');

    console.log('Publication');
    const published = await head('POST', '/showcase/publish');
    ok(published.status === 201 && published.body.hasDraft === false && published.body.published.tagline === draft.tagline && published.body.publishedAt, 'publishing applies the draft in one go', published.body);
    const live = await publicPage();
    ok(live.body.tagline === draft.tagline && live.body.content.history === draft.history && live.body.content.downloads[0].label === 'Règlement intérieur' && live.body.content.directorMessage === draft.directorMessage, 'the public page shows the new content');
    ok((await head('POST', '/showcase/publish')).status === 400, 'nothing to publish without a draft');
    await head('PUT', '/showcase/draft', { tagline: 'Essai abandonné' });
    const discarded = await head('DELETE', '/showcase/draft');
    ok(discarded.status === 200 && discarded.body.hasDraft === false && (await publicPage()).body.tagline === draft.tagline, 'a draft can be discarded: the published page stays as it was');
    const second = await head('PUT', '/showcase/draft', { values: 'Discipline et réussite' });
    await head('POST', '/showcase/publish');
    const after = await publicPage();
    ok(second.status === 200 && after.body.content.values === 'Discipline et réussite' && after.body.content.history === draft.history && after.body.tagline === draft.tagline, 'publishing one change keeps everything else that was published');

    console.log('Contact form');
    const message = { name: 'Jean Kouassi', email: 'jean@test-vitrine.local', phone: '+2250700000000', message: `${TAG} : je souhaite inscrire ma fille en seconde.`, consent: true };
    const sent = await call('POST', `/public/schools/${code}/contact`, message);
    ok(sent.status === 200 && sent.body.success === true, 'a visitor sends a message', sent.body);
    const notif = await prisma.notification.findFirst({ where: { user: { email: HEAD }, subject: 'Message reçu depuis la vitrine' } });
    ok(!!notif && notif.message.includes('Jean Kouassi') && notif.message.includes('seconde'), 'it reaches the management in the application');
    const mails = await fetch(`${MAILHOG}/api/v2/search?kind=containing&query=${encodeURIComponent(TAG)}`).then((r) => r.json()).catch(() => null);
    ok(mails === null || mails.total >= 1, mails === null ? 'e-mail not checked (mail catcher unreachable)' : 'and by e-mail');
    ok((await call('POST', `/public/schools/${code}/contact`, { ...message, consent: false })).status === 400, 'consent is required');
    ok((await call('POST', `/public/schools/${code}/contact`, { ...message, message: 'court' })).status === 400, 'an empty message is refused');
    ok((await call('POST', `/public/schools/INCONNU-0000/contact`, message)).status === 404, 'an unknown school is refused');
  } catch (e) {
    failures++;
    console.log('  ✘ unexpected error', e);
  } finally {
    await cleanup().catch((e) => console.log('cleanup failed', e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll showcase checks passed');
  process.exit(failures ? 1 : 0);
})();

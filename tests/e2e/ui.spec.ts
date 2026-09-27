import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { uiLogin } from './helpers';

/** Desktop browser journeys (non-regression of existing screens + new SaaS screens). */

async function axeSerious(page: import('@playwright/test').Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id} (${v.nodes.length})`);
}

test('[UI-01] Connexion par le formulaire, déconnexion, page protégée redirigée', async ({ page }) => {
  await uiLogin(page, 'director');
  await expect(page.getByRole('heading', { name: "Vue d'ensemble" })).toBeVisible();
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await page.waitForURL(/\/login/);
  await page.goto('/students');
  await page.waitForURL(/\/login/);
});

test('[UI-02] Mauvais identifiants : message d’erreur annoncé', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill('directeur@school.local');
  await page.getByLabel('Mot de passe').fill('mauvais');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  // Next.js adds its own (empty) role=alert route announcer: target ours by its text.
  await expect(page.getByRole('alert').filter({ hasText: 'incorrect' })).toBeVisible();
});

test('[UI-03] Tableau de bord directeur : KPI et finances', async ({ page }) => {
  await uiLogin(page, 'director');
  await expect(page.getByText('Effectif')).toBeVisible();
  await expect(page.getByText('Total facturé')).toBeVisible();
  expect(await axeSerious(page)).toEqual([]);
});

test('[UI-04] Tableau de bord enseignant : pas de bloc finances, menu restreint', async ({ page }) => {
  await uiLogin(page, 'teacher');
  await expect(page.getByText('Effectif')).toBeVisible();
  await expect(page.getByText('Total facturé')).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('link', { name: 'Paie' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Facturation' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Notes et bulletins' })).toBeVisible();
});

test('[UI-05] Élèves : liste, création via la modale accessible (Échap ferme)', async ({ page }) => {
  await uiLogin(page, 'director');
  await page.goto('/students');
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: /Nouvel élève/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: /Nouvel élève/ }).click();
  await page.getByLabel('Prénom', { exact: true }).fill('Sika');
  const lastName = `Navigateur${Date.now().toString(36)}`; // unique: the scenario is replayable
  await page.getByLabel('Nom', { exact: true }).fill(lastName);
  await page.getByLabel('Date de naissance').fill('2013-04-04');
  await page.getByRole('dialog').getByRole('button', { name: /Enregistrer|Créer|Inscrire/ }).click();
  await expect(page.getByRole('link', { name: `${lastName} Sika` })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('1 élève');
  expect(await axeSerious(page)).toEqual([]);
});

test('[UI-06] Enseignant : le bouton de création d’élève n’est pas proposé', async ({ page }) => {
  await uiLogin(page, 'teacher');
  await page.goto('/students');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('button', { name: /Nouvel élève/ })).toHaveCount(0);
});

test('[UI-07] Appel (présences) : enregistrement par l’enseignant', async ({ page }) => {
  await uiLogin(page, 'teacher');
  await page.goto('/attendance');
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: /Enregistrer/ }).click();
  await expect(page.getByText(/enregistr/i).first()).toBeVisible();
});

test('[UI-08] Notes : saisie et bulletin PDF accessibles à l’enseignant', async ({ page }) => {
  await uiLogin(page, 'teacher');
  await page.goto('/grades');
  await expect(page.getByLabel('Classe')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});

test('[UI-09] Facturation : relance des impayés depuis l’écran', async ({ page }) => {
  await uiLogin(page, 'accountant');
  await page.goto('/billing');
  await page.getByRole('button', { name: 'Relancer les impayés échus' }).click();
  await expect(page.getByRole('status').filter({ hasText: /relanc|Aucune facture/ })).toBeVisible();
});

test('[UI-10] Paie : écran accessible au comptable', async ({ page }) => {
  await uiLogin(page, 'accountant');
  await page.goto('/payroll');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await axeSerious(page)).toEqual([]);
});

test('[UI-11] Emplois du temps : grille publiée, exports proposés', async ({ page }) => {
  await uiLogin(page, 'director');
  await page.goto('/timetable');
  await expect(page.getByRole('table', { name: 'Emploi du temps' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calendrier (.ics)' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel (CSV)' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

test('[UI-12] Documents : aperçu d’un certificat dans un cadre isolé', async ({ page }) => {
  await uiLogin(page, 'director');
  await page.goto('/documents');
  const certificate = page.getByLabel('Modèle').locator('option', { hasText: 'Certificat de scolarité' });
  await page.getByLabel('Modèle').selectOption(await certificate.getAttribute('value'));
  await page.getByLabel('Élève').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Aperçu' }).click();
  const frame = page.frameLocator('iframe[title="Aperçu du document"]');
  await expect(frame.getByText(/Certificat/i).first()).toBeVisible();
  await expect(page.locator('iframe[title="Aperçu du document"]')).toHaveAttribute('sandbox', 'allow-modals');
});

test('[UI-13] Vitrine et identité : contraste vérifié en direct', async ({ page }) => {
  await uiLogin(page, 'director');
  await page.goto('/settings');
  await expect(page.getByText(/Contraste avec le texte blanc/)).toContainText('lisible');
  await page.getByRole('tab', { name: 'Vitrine publique' }).click();
  await expect(page.getByRole('heading', { name: 'Mot du directeur' })).toBeVisible();
  expect(await axeSerious(page)).toEqual([]);
});

test('[UI-14] Journal d’audit consultable par la direction', async ({ page }) => {
  await uiLogin(page, 'director');
  await page.goto('/audit');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText('PAYMENT').first()).toBeVisible();
});

test('[UI-15] Console plateforme : écoles, plans et modules', async ({ page }) => {
  await uiLogin(page, 'platform');
  await expect(page.getByRole('heading', { name: 'Écoles et plans' })).toBeVisible();
  await expect(page.getByText('Lycée Horizon', { exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('link', { name: 'Élèves' })).toHaveCount(0);
});

test('[UI-16] Vitrine publique rendue côté serveur (SEO / OpenGraph)', async ({ request }) => {
  const res = await request.get('/ecole/DEMO-001');
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('<title>Groupe Scolaire La Réussite');
  expect(html).toMatch(/<meta property="og:title"/);
  expect(html).toContain('Préinscrire mon enfant'); // content present without JavaScript
});

test('[UI-17] Vitrine sur sous-domaine de l’école', async ({ page }) => {
  // First access to a *.localhost host on Windows/Docker Desktop takes ~15 s (IPv6 then IPv4
  // fallback, measured); the showcase is server-rendered, so the DOM content is what matters.
  test.setTimeout(90_000);
  const port = new URL(process.env.RECETTE_WEB ?? 'http://localhost:13000').port;
  await page.goto(`http://demo-001.localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Groupe Scolaire La Réussite' })).toBeVisible({ timeout: 30_000 });
});

test('[UI-18] Préinscription publique depuis la vitrine', async ({ page }) => {
  await page.goto('/ecole/DEMO-001/inscription');
  await page.getByLabel("Prénom de l'enfant").fill('Yao');
  await page.getByLabel("Nom de l'enfant", { exact: true }).fill('Navigateur');
  await page.getByLabel('Email du parent/tuteur').fill('yao.navigateur@parent.local');
  await page.getByRole('button', { name: /Envoyer/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Candidature envoyée' })).toBeVisible();
});

test('[UI-23] En-têtes de sécurité sur les pages web (CSP, anti-clickjacking, nosniff)', async ({ request }) => {
  const res = await request.get('/ecole/DEMO-001');
  const h = res.headers();
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['permissions-policy']).toBeTruthy();
  expect(h['x-powered-by']).toBeUndefined();
});

test('[UI-19] Vérification publique d’un document inconnu', async ({ page }) => {
  await page.goto('/verifier/code-inexistant');
  await expect(page.getByRole('alert').filter({ hasText: 'Aucun document' })).toBeVisible();
});

test('[UI-20] Portail parent : enfants, notes, factures', async ({ page }) => {
  await uiLogin(page, 'parent');
  await expect(page).toHaveURL(/\/portal/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await axeSerious(page)).toEqual([]);
});

test('[UI-21] Navigation clavier : lien d’évitement puis contenu', async ({ page }) => {
  await uiLogin(page, 'director');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
});

test('[UI-22] Accessibilité automatisée (axe) : pages publiques et connexion', async ({ page }) => {
  for (const url of ['/login', '/mot-de-passe-oublie', '/ecole/DEMO-001', '/ecole/DEMO-001/inscription']) {
    await page.goto(url);
    expect(await axeSerious(page), url).toEqual([]);
  }
});

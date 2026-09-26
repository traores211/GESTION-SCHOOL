import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { uiLogin } from './helpers';

/** Desktop browser journeys (non-regression of existing screens + new SaaS screens). */
test.describe.configure({ mode: 'serial' });

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
  await expect(page.getByRole('alert')).toContainText('incorrect');
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
  await page.getByLabel('Prénom').fill('Sika');
  await page.getByLabel('Nom').fill('Navigateur');
  await page.getByLabel('Date de naissance').fill('2013-04-04');
  await page.getByRole('dialog').getByRole('button', { name: /Enregistrer|Créer|Inscrire/ }).click();
  await expect(page.getByText('Navigateur')).toBeVisible();
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
  await expect(page.getByText('Lycée Horizon')).toBeVisible();
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
  const port = new URL(process.env.RECETTE_WEB ?? 'http://localhost:13000').port;
  await page.goto(`http://demo-001.localhost:${port}/`);
  await expect(page.getByRole('heading', { level: 1, name: 'Groupe Scolaire La Réussite' })).toBeVisible();
});

test('[UI-18] Préinscription publique depuis la vitrine', async ({ page }) => {
  await page.goto('/ecole/DEMO-001/inscription');
  await page.getByLabel("Prénom de l'enfant").fill('Yao');
  await page.getByLabel("Nom de l'enfant").fill('Navigateur');
  await page.getByLabel('Email du parent/tuteur').fill('yao.navigateur@parent.local');
  await page.getByRole('button', { name: /Envoyer/ }).click();
  await expect(page.getByRole('status')).toContainText('Candidature envoyée');
});

test('[UI-19] Vérification publique d’un document inconnu', async ({ page }) => {
  await page.goto('/verifier/code-inexistant');
  await expect(page.getByRole('alert')).toContainText('Aucun document');
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

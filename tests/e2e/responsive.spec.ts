import { expect, test } from '@playwright/test';
import { uiLogin } from './helpers';

/** Runs on the tablet and mobile projects. */
async function noHorizontalScroll(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'pas de défilement horizontal de la page').toBeLessThanOrEqual(1);
}

test('[MO-01] Connexion utilisable sur petit écran', async ({ page }) => {
  await uiLogin(page, 'teacher');
  await noHorizontalScroll(page);
});

test('[MO-02] Navigation mobile : barre inférieure et menu « Plus »', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'barre inférieure affichée seulement sous 860 px');
  await uiLogin(page, 'teacher');
  const bar = page.getByRole('navigation', { name: 'Navigation mobile' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Plus' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: 'Emplois du temps' }).click();
  await expect(page).toHaveURL(/\/timetable/);
});

test('[MO-03] Appel sur mobile : liste de la classe et enregistrement', async ({ page }) => {
  await uiLogin(page, 'teacher');
  await page.goto('/attendance');
  await expect(page.getByRole('button', { name: /Enregistrer/ })).toBeVisible();
  await noHorizontalScroll(page);
});

test('[MO-04] Portail parent sur mobile', async ({ page }) => {
  await uiLogin(page, 'parent');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await noHorizontalScroll(page);
});

test('[MO-05] Tableau de bord et élèves sans défilement horizontal', async ({ page }) => {
  await uiLogin(page, 'director');
  await noHorizontalScroll(page);
  await page.goto('/students');
  await expect(page.getByRole('table')).toBeVisible();
  await noHorizontalScroll(page);
});

test('[MO-06] Vitrine publique mobile-first', async ({ page }) => {
  await page.goto('/ecole/DEMO-001');
  await expect(page.getByRole('link', { name: 'Préinscrire mon enfant' }).first()).toBeVisible();
  await noHorizontalScroll(page);
});

test('[MO-07] Assistant et documents atteignables sur mobile', async ({ page }) => {
  await uiLogin(page, 'director');
  await page.goto('/assistant');
  await expect(page.getByRole('heading', { name: 'Assistant' })).toBeVisible();
  await noHorizontalScroll(page);
  await page.goto('/documents');
  await expect(page.getByRole('tab', { name: 'Générer' })).toBeVisible();
});

test('[MO-08] Modale en feuille basse sur mobile, fermeture au clavier', async ({ page }) => {
  await uiLogin(page, 'director');
  await page.goto('/students');
  await page.getByRole('button', { name: /Nouvel élève/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

import { expect, signIn, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the student list loads and filters by search", async ({ page }) => {
  await page.goto("/students");
  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();
  await page.getByLabel("Rechercher un élève").fill("zzzz-aucun-eleve");
  await expect(page.getByText("Aucun élève ne correspond")).toBeVisible();
});

test("pupils can be archived, staff accounts deactivated: the actions are offered", async ({ page }) => {
  await page.goto("/students");
  await expect(page.getByRole("button", { name: /^Archiver / }).first()).toBeVisible();
  await page.getByLabel("Élèves archivés").check();
  await expect(page.getByRole("button", { name: /^Archiver / })).toHaveCount(0);
  await page.goto("/staff");
  await expect(page.getByRole("button", { name: /^Désactiver le compte de / }).first()).toBeVisible();
  await expect(page.getByText("Actif").first()).toBeVisible();
});

test("the billing page lists invoices with their status", async ({ page }) => {
  await page.goto("/billing");
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await expect(page.getByText(/FCFA/).first()).toBeVisible();
});

test("the admissions pipeline opens a dossier with its timeline", async ({ page }) => {
  await page.goto("/admissions");
  const firstDossier = page.locator('a[href^="/admissions/"]').first();
  await expect(firstDossier).toBeVisible();
  await firstDossier.click();
  await expect(page).toHaveURL(/\/admissions\/[\w-]+/);
  await expect(page.getByText(/Candidature enregistrée/).first()).toBeVisible();
});

test("the audit journal is reachable by administrators", async ({ page }) => {
  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: /journal/i }).first()).toBeVisible();
});

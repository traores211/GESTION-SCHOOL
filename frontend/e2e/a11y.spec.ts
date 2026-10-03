import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";

/**
 * Automated accessibility audit (axe-core, WCAG 2.1 A and AA) of the main screens, in both themes.
 * It catches contrast, missing labels, roles and names; keyboard and screen-reader behaviour still
 * need a human check.
 */
async function audit(page: Page, name: string) {
  // Charts load after the page: without them the dashboard would be audited half-empty.
  if (name.startsWith("/dashboard")) await page.locator(".recharts-surface").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  // Entrance animations fade content in: measured mid-way they look like low contrast. Wait for
  // the finite ones to end (spinners and other endless animations are left alone).
  await page.waitForTimeout(300);
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]),
  );
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
  const problems = results.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")}${n.any[0]?.message ? ` — ${n.any[0].message}` : ""}`).join("\n    ")}`);
  // Soft: one run lists the problems of every screen instead of stopping at the first one.
  expect.soft(problems, `${name}\n  ${problems.join("\n  ")}`).toEqual([]);
}

const PUBLIC_PAGES = ["/login", "/forgot-password", "/confidentialite"];
const STAFF_PAGES = ["/dashboard", "/insights", "/students", "/attendance", "/grades", "/grades/council", "/discipline", "/admissions", "/billing", "/messaging", "/imports", "/privacy", "/audit", "/account"];

test.describe("accessibility", () => {
  for (const path of PUBLIC_PAGES) {
    test(`public ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await audit(page, path);
    });
  }

  test("staff screens, light theme", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page);
    for (const path of STAFF_PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await audit(page, path);
    }
  });

  test("staff screens, dark theme", async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await signIn(page);
    for (const path of ["/dashboard", "/students", "/billing", "/grades/council", "/messaging"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await audit(page, `${path} (dark)`);
    }
  });

  test("parent portal", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adresse email").fill("parent@school.local");
    await page.getByLabel("Mot de passe", { exact: true }).fill("parent123");
    await page.getByRole("button", { name: /se connecter/i }).click();
    await page.waitForURL(/\/portal/);
    await page.waitForLoadState("networkidle");
    await audit(page, "/portal");
    for (const tab of ["Bulletins", "Emploi du temps", "Scolarité"]) {
      await page.getByRole("tab", { name: tab }).click();
      await page.waitForLoadState("networkidle");
      await audit(page, `/portal — ${tab}`);
    }
  });
});

import { expect, signIn, test } from "./fixtures";

test.describe("public pages", () => {
  test("the login page offers sign-in and password recovery", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test("a wrong password shows an error and stays on the login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adresse email").fill("admin@school.local");
    await page.getByLabel("Mot de passe", { exact: true }).fill("pas-le-bon-mot-de-passe-1");
    await page.getByRole("button", { name: /se connecter/i }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("unknown addresses show the 404 page", async ({ page }) => {
    await page.goto("/cette-page-n-existe-pas");
    await expect(page.getByRole("heading", { name: "Cette page n'existe pas" })).toBeVisible();
  });

  test("protected pages send visitors to the login page", async ({ page }) => {
    await page.goto("/students");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("signed-in journeys", () => {
  test("sign in, reach the dashboard, sign out", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("navigation", { name: "Navigation principale" }).or(page.locator("#app-sidebar"))).toBeAttached();
    await page.getByRole("button", { name: "Menu du compte" }).click();
    await page.getByRole("button", { name: /se déconnecter/i }).or(page.getByRole("menuitem", { name: /se déconnecter/i })).click();
    await expect(page).toHaveURL(/\/login/);
    // The refresh cookie is revoked: going back does not restore the session.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the session survives a reload through the refresh cookie", async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => localStorage.removeItem("schoolerp_token"));
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

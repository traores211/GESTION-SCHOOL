import { expect, Page, test as base } from "@playwright/test";

/** Demo accounts of the seed (prisma/seed.ts); override in CI with E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD. */
export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || "admin@school.local",
  password: process.env.E2E_ADMIN_PASSWORD || "admin123",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

/** Pages whose network is cut by `setOffline` (the API forwarder below does not go through the browser). */
const offlinePages = new WeakSet<Page>();

/** Cuts or restores the network of a page, like a phone losing its signal in a classroom. */
export async function setOffline(page: Page, offline: boolean) {
  if (offline) offlinePages.add(page);
  else offlinePages.delete(page);
  await page.context().setOffline(offline);
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const proxy = process.env.E2E_API_PROXY;
    if (proxy) {
      const origin = new URL(API_URL).origin;
      // The page origin differs from the one the API allows, so CORS headers are rewritten as well.
      await page.route(`${origin}/**`, async (route) => {
        const request = route.request();
        if (offlinePages.has(page)) return route.abort("internetdisconnected");
        const pageOrigin = new URL(page.url() || "http://localhost").origin;
        const cors = {
          "access-control-allow-origin": pageOrigin,
          "access-control-allow-credentials": "true",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
        };
        if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        const headers = { ...request.headers() };
        delete headers.origin;
        try {
          const response = await route.fetch({ url: request.url().replace(origin, proxy), headers });
          await route.fulfill({ response, headers: { ...response.headers(), ...cors } });
        } catch {
          // page closed while the request was in flight (end of test)
        }
      });
    }
    await use(page);
  },
});

export { expect };

export async function signIn(page: Page, account = ADMIN) {
  await page.goto("/login");
  await page.getByLabel("Adresse email").fill(account.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/dashboard/);
}

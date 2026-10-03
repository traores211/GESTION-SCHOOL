import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests of the main journeys against a running stack (API seeded with the demo data).
 *   E2E_BASE_URL   web app address (default http://localhost:3000)
 *   E2E_API_PROXY  when the browser cannot reach NEXT_PUBLIC_API_URL itself (tests run inside the
 *                  frontend container), API calls are forwarded to this address, e.g. http://backend:4000
 *   CHROMIUM_PATH  system Chromium to use instead of Playwright's download (Alpine images)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    locale: "fr-FR",
    timezoneId: "Africa/Abidjan",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } },
      testMatch: /smoke/,
    },
  ],
});

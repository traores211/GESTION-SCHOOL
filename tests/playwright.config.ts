import { defineConfig, devices } from '@playwright/test';

/**
 * Post-deployment acceptance tests (cahier de recettes). They run AGAINST A DEPLOYED
 * environment — never against a build — see docs/testing/cahier-recettes.md.
 *   RECETTE_WEB=http://localhost:13000 RECETTE_API=http://localhost:14000/api npx playwright test -c tests
 * Every test title starts with its scenario ID, e.g. "[AUTH-01] …".
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // 20 s: the Docker Desktop (Windows) acceptance host shows multi-second stalls (see PF-01).
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1, // shared acceptance data: deterministic order
  // One replay, reported separately as "PASS au rejeu" (flaky) in the acceptance book — never hidden.
  retries: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: '../test-results/recette.json' }],
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.RECETTE_WEB ?? 'http://localhost:13000',
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: '../test-results/artifacts',
  projects: [
    { name: 'api', testMatch: /(smoke|api|ai|perf)\.spec\.ts/ },
    { name: 'desktop', testMatch: /ui\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', testMatch: /responsive\.spec\.ts/, use: { ...devices['Galaxy Tab S4'], browserName: 'chromium' } },
    { name: 'mobile', testMatch: /(responsive|mobile)\.spec\.ts/, use: { ...devices['Pixel 5'] } },
  ],
});

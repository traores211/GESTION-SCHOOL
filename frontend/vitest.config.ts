import { defineConfig } from "vitest/config";

/** Unit tests live next to the code (src/**\/*.test.ts); browser tests in e2e/ belong to Playwright. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

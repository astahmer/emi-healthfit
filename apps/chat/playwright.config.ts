import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const bddTestDir = defineBddConfig({
  features: "e2e/features/*.feature",
  steps: "e2e/features/steps/*.ts",
  outputDir: "e2e/.features-gen",
});

export default defineConfig({
  forbidOnly: true,
  fullyParallel: true,
  // The 230-test suite runs in ~2.5 min on an idle machine; keep enough
  // headroom that background load cannot kill the whole release gate.
  globalTimeout: 600_000,
  // Prefer deterministic waits over retries. One retry covers CF/worker timing
  // noise without masking product races the way higher retry counts can.
  retries: 1,
  reporter: "line",
  timeout: 20_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testDir: "./e2e",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "bdd",
      testDir: bddTestDir,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

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
  globalTimeout: 180_000,
  retries: 2,
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

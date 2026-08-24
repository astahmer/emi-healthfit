import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const bddTestDir = defineBddConfig({
  features: "e2e/features-worker/*.feature",
  steps: ["e2e/features-worker/steps/*.ts", "e2e/features/steps/chat.steps.ts"],
  outputDir: "e2e/.features-gen-worker",
});

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  globalTimeout: 180_000,
  retries: 2,
  reporter: "line",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3232",
    ...devices["Desktop Chrome"],
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "worker-bdd", testDir: bddTestDir, testMatch: /\.spec\.js$/ },
    { name: "worker-smoke", testDir: "./e2e", testMatch: /worker-smoke\.spec\.ts/ },
  ],
});

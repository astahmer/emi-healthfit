import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const bddTestDir = defineBddConfig({
  features: "test/e2e/features/*.feature",
  steps: "test/e2e/features/steps/*.ts",
  outputDir: "test/e2e/.features-gen",
});

export default defineConfig({
  forbidOnly: true,
  fullyParallel: true,
  globalTimeout: 180_000,
  retries: 1,
  reporter: "line",
  timeout: 20_000,
  testDir: "./test/e2e",
  use: {
    baseURL: "http://127.0.0.1:3233",
    ...devices["Desktop Chrome"],
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testDir: "./test/e2e",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "bdd",
      testDir: bddTestDir,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "VITE_WEBMCP_ENABLED=true vite --host 127.0.0.1 --port 3233",
    reuseExistingServer: true,
    url: "http://127.0.0.1:3233",
  },
});

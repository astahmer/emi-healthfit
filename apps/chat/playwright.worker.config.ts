import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  forbidOnly: true,
  fullyParallel: true,
  globalTimeout: 180_000,
  retries: 1,
  reporter: "line",
  timeout: 30_000,
  testDir: "./e2e",
  testMatch: /worker-smoke\.spec\.ts/,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://emi-chat-worker-e2e.localhost:1355",
    ...devices["Desktop Chrome"],
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
});

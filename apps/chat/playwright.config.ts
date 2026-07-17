import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: true,
  fullyParallel: true,
  globalTimeout: 120_000,
  retries: process.env.CI === undefined ? 0 : 2,
  reporter: "line",
  timeout: 15_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/serve-e2e.mjs",
    url: "http://127.0.0.1:3100/chat",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  use: {
    baseURL: "http://127.0.0.1:3233",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "vite --host 127.0.0.1 --port 3233",
    reuseExistingServer: true,
    url: "http://127.0.0.1:3233",
  },
});

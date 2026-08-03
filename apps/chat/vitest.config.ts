import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: [
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "hooks/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
    ],
    // Parallel suite load makes userEvent interactions occasionally exceed 5s.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: [
        "app/chat/chat-runtime.tsx",
        "app/action-feedback.tsx",
        "app/data-export.tsx",
        "app/data-import.tsx",
        "app/privacy-controls.tsx",
        "app/releases.tsx",
        "app/service-worker-reload.tsx",
        "app/theme-provider.tsx",
        "app/usage-context.tsx",
      ],
      thresholds: { lines: 60, functions: 55, branches: 45, statements: 60 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

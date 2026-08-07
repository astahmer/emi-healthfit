import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 4),
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: ["src/app.tsx", "src/app-config.ts"],
      thresholds: { lines: 50, functions: 45, branches: 35, statements: 50 },
    },
  },
});

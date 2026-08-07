import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 4),
    setupFiles: ["./test/web/setup.ts"],
    include: [
      "test/web/**/*.test.{ts,tsx}",
      "test/runtime/**/*.test.{ts,tsx}",
      "test/components/**/*.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: [
        "src/adapters/ai-sdk.export.ts",
        "src/react-hooks.ts",
        "src/runtime/create-chat-runtime.ts",
        "src/web/chat-runtime/**/*.ts",
        "src/web/thread/thread-viewport-actor.ts",
      ],
      thresholds: { lines: 60, functions: 55, branches: 45, statements: 60 },
    },
  },
});

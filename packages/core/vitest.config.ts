import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/web/setup.ts"],
    include: ["test/web/**/*.test.{ts,tsx}", "test/runtime/**/*.test.{ts,tsx}"],
  },
});

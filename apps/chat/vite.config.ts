import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { serwist } from "@serwist/vite";
import { defineConfig, loadEnv } from "vite";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = environment.API_BASE_URL || "http://localhost:1337";

  return {
    plugins: [
      react(),
      serwist({
        globDirectory: "dist",
        injectionPoint: "self.__SW_MANIFEST",
        rollupFormat: "iife",
        swDest: "sw.js",
        swSrc: "app/sw.ts",
      }),
    ],
    resolve: {
      alias: {
        "@": rootDirectory,
      },
    },
    server: {
      port: 3232,
      proxy: {
        "/api": apiBaseUrl,
        "/ingest": apiBaseUrl,
      },
    },
    build: {
      outDir: "dist",
    },
  };
});

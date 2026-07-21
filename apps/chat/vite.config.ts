import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { serwist } from "@serwist/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import packageJson from "./package.json" with { type: "json" };

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

const emitVersionJson = ({ version, buildId }: { version: string; buildId: string }): Plugin => ({
  name: "emi-version-json",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "version.json",
      source: `${JSON.stringify({ version, buildId }, null, 2)}\n`,
    });
  },
});

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = environment.API_BASE_URL || "http://localhost:1337";
  const buildId =
    environment.EMI_BUILD_ID ||
    environment.CF_PAGES_COMMIT_SHA?.slice(0, 7) ||
    environment.GITHUB_SHA?.slice(0, 7) ||
    "dev";
  const appVersion = packageJson.version;

  return {
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
      "import.meta.env.VITE_APP_BUILD_ID": JSON.stringify(buildId),
    },
    plugins: [
      react(),
      emitVersionJson({ version: appVersion, buildId }),
      serwist({
        globDirectory: "dist",
        globIgnores: ["**/version.json"],
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

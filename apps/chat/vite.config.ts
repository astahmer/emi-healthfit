import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { serwist } from "@serwist/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { coreSourceAliases } from "../../scripts/vite-core-alias.mjs";
import packageJson from "./package.json" with { type: "json" };

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

const emitVersionJson = ({
  version,
  buildId,
  releasedAt,
  commitId,
  changeId,
  releaseHistory,
}: {
  version: string;
  buildId: string;
  releasedAt?: string;
  commitId?: string;
  changeId?: string;
  releaseHistory: string;
}): Plugin => ({
  name: "emi-version-json",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "version.json",
      source: `${JSON.stringify({ version, buildId, releasedAt, commitId, changeId }, null, 2)}\n`,
    });
    this.emitFile({
      type: "asset",
      fileName: "release-history.json",
      source: `${releaseHistory}\n`,
    });
  },
});

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl =
    process.env.API_BASE_URL || environment.API_BASE_URL || "http://localhost:1337";
  const buildId =
    environment.EMI_BUILD_ID ||
    environment.CF_PAGES_COMMIT_SHA?.slice(0, 7) ||
    environment.GITHUB_SHA?.slice(0, 7) ||
    "dev";
  const appVersion = environment.EMI_RELEASE_VERSION || packageJson.version;
  const releaseHistory = environment.EMI_RELEASE_HISTORY || '{"releases":[]}';

  return {
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
      "import.meta.env.VITE_APP_BUILD_ID": JSON.stringify(buildId),
      "import.meta.env.VITE_APP_RELEASED_AT": JSON.stringify(environment.EMI_RELEASED_AT || ""),
      "import.meta.env.VITE_APP_COMMIT_ID": JSON.stringify(environment.EMI_COMMIT_ID || ""),
      "import.meta.env.VITE_APP_CHANGE_ID": JSON.stringify(environment.EMI_CHANGE_ID || ""),
    },
    plugins: [
      react(),
      emitVersionJson({
        version: appVersion,
        buildId,
        releasedAt: environment.EMI_RELEASED_AT || undefined,
        commitId: environment.EMI_COMMIT_ID || undefined,
        changeId: environment.EMI_CHANGE_ID || undefined,
        releaseHistory,
      }),
      serwist({
        globDirectory: "dist",
        globIgnores: ["**/version.json", "**/release-history.json"],
        injectionPoint: "self.__SW_MANIFEST",
        rollupFormat: "iife",
        swDest: "sw.js",
        swSrc: "app/sw.ts",
      }),
    ],
    resolve: {
      alias: [
        { find: "@", replacement: rootDirectory },
        ...(mode === "production" ? [] : coreSourceAliases()),
      ],
    },
    server: {
      host: "127.0.0.1",
      port: Number(process.env.PORT ?? "3232"),
      strictPort: true,
      headers: {
        "Origin-Agent-Cluster": "?1",
        "Permissions-Policy": "tools=(self)",
      },
      proxy: {
        "/api": {
          target: apiBaseUrl,
          changeOrigin: true,
        },
        "/ingest": apiBaseUrl,
      },
    },
    build: {
      outDir: "dist",
    },
  };
});

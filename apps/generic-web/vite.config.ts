import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const workerOrigin = env.VITE_WORKER_ORIGIN ?? "http://127.0.0.1:8787";
  const originTrialToken = env.WEBMCP_ORIGIN_TRIAL_TOKEN?.trim();

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: Number(env.PORT ?? "3233"),
      headers: {
        "Origin-Agent-Cluster": "?1",
        "Permissions-Policy": "tools=(self)",
        ...(originTrialToken === undefined ? {} : { "Origin-Trial": originTrialToken }),
      },
      proxy: {
        "/api": {
          target: workerOrigin,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on("error", (_error, _request, response) => {
              if (response.headersSent) return;
              response.writeHead(503, { "content-type": "application/json" });
              response.end(
                JSON.stringify({
                  error: `Generic Worker is unavailable at ${workerOrigin}. Start pnpm --dir apps/generic-worker dev.`,
                }),
              );
            });
          },
        },
      },
    },
    build: {
      outDir: "dist",
    },
  };
});

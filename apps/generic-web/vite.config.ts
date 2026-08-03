import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const workerOrigin = process.env.VITE_WORKER_ORIGIN ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PORT ?? "3233"),
    headers: {
      "Origin-Agent-Cluster": "?1",
      "Permissions-Policy": "tools=(self)",
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
                error: `Generic Worker is unavailable at ${workerOrigin}. Start pnpm generic:dev.`,
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
});

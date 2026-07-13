import { withAui } from "@assistant-ui/next";
import type { NextConfig } from "next";

const apiBase = process.env.API_BASE_URL || "http://localhost:8787";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "../api/assets",
  trailingSlash: true,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
      { source: "/ingest", destination: `${apiBase}/ingest` },
      { source: "/chat", destination: `${apiBase}/chat` },
    ];
  },
};

export default withAui(nextConfig);

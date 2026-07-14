import type { NextConfig } from "next";

const apiBase = process.env.API_BASE_URL || "http://localhost:1337";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "dist",
  trailingSlash: true,
  async rewrites() {
    return [
      { source: "/chat/:sessionId", destination: "/chat" },
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
      { source: "/ingest", destination: `${apiBase}/ingest` },
      { source: "/chat", destination: `${apiBase}/chat` },
    ];
  },
};

export default nextConfig;

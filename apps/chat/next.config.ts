import { withAui } from "@assistant-ui/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "../api/assets",
  trailingSlash: true,
};

export default withAui(nextConfig);

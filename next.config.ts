import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Static-export routes need to resolve to their own index.html unambiguously
  // when served from Capacitor's local asset server (no real HTTP server to
  // do directory-style resolution the way Cloudflare's assets binding does).
  trailingSlash: true,
};

export default nextConfig;

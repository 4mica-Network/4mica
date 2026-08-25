import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Per-username pages cannot be pre-rendered, so unlike apps/web this is a
  // real Node server. `standalone` emits a self-contained server bundle.
  output: "standalone",
  reactStrictMode: true,

  // apps/web is `output: "export"` on the SAME apex domain and emits its own
  // /_next/static/*. Two Next apps cannot share /_next on one origin — the edge
  // has no way to tell whose chunk a request is for. Set
  // NEXT_PUBLIC_ASSET_PREFIX=/p in production; nginx.conf strips it back off.
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || undefined,

  // @4mica/db and @4mica/url export raw TS source; @4mica/ui follows the
  // precedent set by apps/web/next.config.ts.
  transpilePackages: ["@4mica/db", "@4mica/ui", "@4mica/url"],

  // Engine-backed or fs-backed — never bundle these into a route chunk.
  serverExternalPackages: [
    "@prisma/adapter-pg",
    "@prisma/client",
    "pg",
    "winston",
    "winston-daily-rotate-file",
  ],

  // Standalone tracing must start at the monorepo root or the workspace deps
  // are dropped from the output.
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  turbopack: { root: path.resolve(__dirname, "../..") },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
      { protocol: "https", hostname: "**.4mica.io" },
    ],
  },
};

export default nextConfig;

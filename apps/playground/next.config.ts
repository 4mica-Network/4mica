import { networkInterfaces } from "node:os";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net?.family === "IPv4" && !net.internal)
  .map((net) => net?.address)
  .filter((address): address is string => Boolean(address));

const extraDevOrigins = (process.env.DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const assetPrefix = process.env.NEXT_PUBLIC_ASSET_PREFIX || undefined;

const nextConfig: NextConfig = {
  // Per-username pages cannot be pre-rendered, so unlike apps/web this is a
  // real Node server. `standalone` emits a self-contained server bundle.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,

  allowedDevOrigins: [...lanAddresses, ...extraDevOrigins],

  // apps/web is `output: "export"` on the SAME apex domain and emits its own
  // /_next/static/*. Two Next apps cannot share /_next on one origin — the edge
  // has no way to tell whose chunk a request is for. Set
  // NEXT_PUBLIC_ASSET_PREFIX=/p in production; nginx.conf strips it back off.
  assetPrefix,

  // @4mica/db and @4mica/url export raw TS source; @4mica/ui follows the
  // precedent set by apps/web/next.config.ts.
  transpilePackages: ["@4mica/db", "@4mica/rules", "@4mica/ui", "@4mica/url"],

  // Engine-backed or fs-backed — never bundle these into a route chunk.
  serverExternalPackages: [
    "@prisma/adapter-pg",
    "@prisma/client",
    "ioredis",
    "pg",
    "winston",
    "winston-daily-rotate-file",
    "winston-transport",
  ],

  // Standalone tracing must start at the monorepo root or the workspace deps
  // are dropped from the output.
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  turbopack: { root: path.resolve(__dirname, "../..") },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  experimental: {
    optimizePackageImports: ["@4mica/ui", "framer-motion"],
  },

  images: {
    path: `${assetPrefix ?? ""}/_next/image`,
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
      { protocol: "https", hostname: "**.4mica.io" },
    ],
  },
};

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || undefined;
const sentryRelease = process.env.SENTRY_RELEASE || undefined;
const sentryRepository = process.env.SENTRY_REPOSITORY || undefined;
const sentryEnvironment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: sentryAuthToken,
  silent: !process.env.CI,
  telemetry: false,
  release: {
    name: sentryRelease,
    create: Boolean(sentryAuthToken && sentryRelease),
    finalize: Boolean(sentryAuthToken && sentryRelease),
    setCommits:
      sentryRelease && sentryRepository
        ? { repo: sentryRepository, commit: sentryRelease, ignoreMissing: true }
        : false,
    deploy:
      sentryAuthToken && sentryRelease && sentryEnvironment
        ? { env: sentryEnvironment }
        : false,
  },
  sourcemaps: {
    disable: !sentryAuthToken,
    deleteSourcemapsAfterUpload: true,
  },
  widenClientFileUpload: true,
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
});

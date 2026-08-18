import { fileURLToPath, URL } from "node:url";
import type { TestProjectConfiguration } from "vitest/config";

/**
 * This is NOT a Vitest workspace config.
 *
 * `test.workspace` and `defineWorkspace` were both removed in Vitest 4 —
 * `vitest/dist/config.js` exports only `defineConfig` and `defineProject`, and
 * the CLI throws "The `test.workspace` option was removed in Vitest 4. Please
 * migrate to `test.projects` instead." There is also no filesystem
 * auto-discovery of this filename any more.
 *
 * So it is a plain module owning the project list, imported by
 * vitest.config.ts into `test.projects`. Two projects, because the suites need
 * genuinely different environments and one config cannot express that.
 */

const src = (path: string) =>
  fileURLToPath(new URL(`./src${path}`, import.meta.url));

/**
 * Each project needs an explicit root. Inline project configs do not inherit
 * the parent's, so a relative `include` is resolved against the monorepo root
 * and the run picks up every other workspace's tests.
 */
const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Mirrors the `paths` in tsconfig.json.
 *
 * These live here rather than at the top level of vitest.config.ts because a
 * root `resolve.alias` does NOT cascade into `test.projects` — each project
 * resolves independently, and omitting these gives
 * "Cannot find package '@/env'".
 *
 * Order matters: Vite matches aliases in insertion order, so the bare "@"
 * prefix has to come last or it would swallow "@components" and friends.
 */
export const alias = {
  "@4mica/url": fileURLToPath(
    new URL("../../packages/url/src/index.ts", import.meta.url),
  ),
  "@actions": src("/actions"),
  "@assets": src("/assets"),
  "@components": src("/components"),
  "@context": src("/context"),
  "@i18n": src("/i18n"),
  "@logger": src("/logger"),
  "@schema": src("/schema"),
  "@services": src("/services"),
  "@utils": src("/utils"),
  "@": src(""),
};

const PUBLIC_ENV = {
  // `as const` because src/type.d.ts narrows ProcessEnv["NODE_ENV"] to a union.
  NODE_ENV: "test" as const,
  NEXT_PUBLIC_BASE_URL: "https://4mica.io",
  NEXT_PUBLIC_APP_URL: "https://4mica.io",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk",
};

export const projects: TestProjectConfiguration[] = [
  {
    root,
    resolve: { alias },
    test: {
      name: "node",
      environment: "node",
      include: ["src/**/*.test.ts"],
      // @4mica/db and @4mica/url ship raw TypeScript, so Vite has to transform
      // them rather than treat them as external deps. Same as apps/be.
      server: { deps: { inline: [/@4mica\//] } },
      env: {
        ...PUBLIC_ENV,
        DATABASE_URL:
          "postgresql://test:test@127.0.0.1:5432/test?schema=public",
        LOG_LEVEL: "error",
        CLERK_SECRET_KEY: "sk_test_000000000000000000000000000000000000000000",
      },
    },
  },
  {
    root,
    resolve: { alias },
    test: {
      name: "jsdom",
      environment: "jsdom",
      include: ["src/**/*.test.tsx"],
      setupFiles: ["./vitest.setup.ts"],
      server: { deps: { inline: [/@4mica\//] } },
      env: PUBLIC_ENV,
    },
  },
];

export default projects;

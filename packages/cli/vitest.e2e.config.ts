import { defineConfig } from "vitest/config";

// `pnpm test:e2e`: the suites that need a real core and chain. They are
// named *.e2e.ts so that `pnpm test`, and the pre-commit hook, never run
// them. One at a time, in order: the steps share a wallet and its nonce.
export default defineConfig({
  test: {
    include: ["src/e2e/**/*.e2e.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});

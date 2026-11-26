import { defineConfig } from "vitest/config";

// Vitest's five seconds is too little for the first test in a file that
// loads the SDK and viem: a second on a laptop, over five on a shared CI
// runner. The limit is there to catch a hang, not to time an import. The
// suites that start the real binary raise it further themselves.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

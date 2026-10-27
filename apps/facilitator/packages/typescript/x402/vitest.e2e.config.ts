import { defineConfig } from 'vitest/config'

// Runs against the stack apps/facilitator/packages/e2e/stack.sh brings up; run it through that.
export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})

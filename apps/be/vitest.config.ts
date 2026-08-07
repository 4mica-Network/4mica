import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test?schema=public",
      LOG_LEVEL: "error",
      CLERK_PUBLISHABLE_KEY: "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk",
      CLERK_SECRET_KEY: "sk_test_000000000000000000000000000000000000000000",
    },
    server: {
      deps: {
        inline: [/@4mica\//],
      },
    },
  },
});

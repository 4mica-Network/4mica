import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test?schema=public",
      LOG_LEVEL: "error",
    },
    server: {
      deps: {
        inline: [/@4mica\//],
      },
    },
  },
});

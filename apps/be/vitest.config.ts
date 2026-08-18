import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@auth": fileURLToPath(new URL("./src/auth", import.meta.url)),
      "@config": fileURLToPath(new URL("./src/config", import.meta.url)),
      "@controllers": fileURLToPath(
        new URL("./src/controllers", import.meta.url),
      ),
      "@lifecycle": fileURLToPath(new URL("./src/lifecycle", import.meta.url)),
      "@logger": fileURLToPath(new URL("./src/logger", import.meta.url)),
      "@plugins": fileURLToPath(new URL("./src/plugins", import.meta.url)),
      "@routes": fileURLToPath(new URL("./src/routes", import.meta.url)),
      "@services": fileURLToPath(new URL("./src/services", import.meta.url)),
    },
  },
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

import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@config": fileURLToPath(new URL("./src/config", import.meta.url)),
      "@controllers": fileURLToPath(
        new URL("./src/controllers", import.meta.url),
      ),
      "@lifecycle": fileURLToPath(new URL("./src/lifecycle", import.meta.url)),
      "@logger": fileURLToPath(new URL("./src/logger", import.meta.url)),
      "@plugins": fileURLToPath(new URL("./src/plugins", import.meta.url)),
      "@routes": fileURLToPath(new URL("./src/routes", import.meta.url)),
      "@services": fileURLToPath(new URL("./src/services", import.meta.url)),
      "@templates": fileURLToPath(new URL("./src/templates", import.meta.url)),
      "@emails": fileURLToPath(new URL("./emails", import.meta.url)),
      "@components": fileURLToPath(new URL("./components", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      LOG_LEVEL: "error",
      EMAIL_DRY_RUN: "true",
    },
    server: { deps: { inline: [/@4mica\//] } },
  },
});

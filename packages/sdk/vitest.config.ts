import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [
      "dist/**",
      "node_modules/**",
      "tests/**/*.e2e.test.ts",
      ...(process.env.CI ? ["tests/**/*.integration.test.ts"] : []),
    ],
  },
});

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
      "@assets": new URL("./public/assets", import.meta.url).pathname,
      "@components": new URL("./components", import.meta.url).pathname,
      "@config": new URL("./config", import.meta.url).pathname,
      "@context": new URL("./context", import.meta.url).pathname,
      "@hooks": new URL("./hooks", import.meta.url).pathname,
      "@lib": new URL("./lib", import.meta.url).pathname,
      "@services": new URL("./services", import.meta.url).pathname,
    },
  },
  test: {
    coverage: {
      provider: "v8",
      exclude: ["dist/**", "dev-dist/**"],
    },
    include: ["**/*.{test,spec}.[jt]s?(x)"],
    exclude: [...configDefaults.exclude],
  },
});

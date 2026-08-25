import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: false,
    minify: "esbuild",
  },
  esbuild: command === "build" ? { drop: ["console", "debugger"] } : {},
  resolve: {
    alias: {
      "@4mica/url": fileURLToPath(
        new URL("../../packages/url/src/index.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@api": fileURLToPath(new URL("./src/api", import.meta.url)),
      "@stores": fileURLToPath(new URL("./src/stores", import.meta.url)),
      "@utils": fileURLToPath(new URL("./src/utils", import.meta.url)),
      "@i18n": fileURLToPath(new URL("./src/i18n", import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: { port: 4173, strictPort: false },
  preview: { port: 4173 },
}));

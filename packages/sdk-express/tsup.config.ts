import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  clean: true,
  sourcemap: true,
  minify: false,
  treeshake: true,
  target: "es2022",
  external: ["@4mica/sdk", "@4mica/sdk/server", "express"],
});

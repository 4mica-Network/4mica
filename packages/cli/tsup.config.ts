import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  outDir: "dist",
  format: ["esm"],
  target: "es2022",
  banner: { js: "#!/usr/bin/env node" },
  dts: false,
  splitting: false,
  clean: true,
  sourcemap: true,
  minify: false,
  treeshake: true,
  // Templates are copied verbatim at runtime from ../templates — never bundled.
  external: ["yargs", "@clack/prompts"],
});

import { defineConfig } from "tsup";

export default defineConfig({
  // One output file per source file: oclif finds commands by walking
  // dist/commands, and loads only the one being run.
  entry: ["src/**/*.ts", "!src/**/*.test.ts", "!src/test/**", "!src/e2e/**"],
  bundle: false,
  outDir: "dist",
  format: ["esm"],
  target: "es2022",
  dts: false,
  clean: true,
  sourcemap: true,
});

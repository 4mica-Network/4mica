import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "index.ts",
    "components/button/index.tsx",
    "components/dropdown/index.tsx",
    "components/link/index.tsx",
    "components/tooltip/index.tsx",
    "lib/cn.ts",
  ],
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  clean: true,
  sourcemap: true,
  minify: false,
  treeshake: true,
  target: "es2022",
  external: ["react", "react-dom"],
});

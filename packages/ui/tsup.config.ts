import { defineConfig } from "tsup";

export default defineConfig({
  // Every component needs its own entry so client-only code lands in its own
  // chunk. Without one it is inlined into the barrel, which then gets marked
  // "use client" and drags server-safe exports like `cn` along with it.
  entry: [
    "index.ts",
    "components/button/index.tsx",
    "components/card/index.tsx",
    "components/dropdown/index.tsx",
    "components/input-field/index.tsx",
    "components/link/index.tsx",
    "components/switch/index.tsx",
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

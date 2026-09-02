import { defineConfig } from "tsup";

export default defineConfig({
  // Every component needs its own entry so client-only code lands in its own
  // chunk. Without one it is inlined into the barrel, which then gets marked
  // "use client" and drags server-safe exports like `cn` along with it.
  entry: [
    "index.ts",
    "components/banner/index.tsx",
    "components/button/index.tsx",
    "components/card/index.tsx",
    "components/checkbox/index.tsx",
    "components/combo-box/index.tsx",
    "components/dropdown/index.tsx",
    "components/empty-state/index.tsx",
    "components/input-field/index.tsx",
    "components/link/index.tsx",
    "components/modal/index.tsx",
    "components/modal/useModalA11y.ts",
    "components/select/index.tsx",
    "components/spinner/index.tsx",
    "components/stack/index.tsx",
    "components/stack/AutoStackHeight.tsx",
    "components/switch/index.tsx",
    "components/tab/index.tsx",
    "components/tab/TabGroup.tsx",
    "components/tag/index.tsx",
    "components/tooltip/index.tsx",
    "components/typography/index.tsx",
    "components/video-player/index.tsx",
    "lib/cn.ts",
    "utils/getIconSize.ts",
    "utils/hexToRGB.ts",
  ],
  outDir: "dist",
  format: ["esm", "cjs"],
  // No `dts`. This package is private and every consumer compiles it from
  // source — the two Next apps via `transpilePackages`, the dashboard via
  // Vite — so package.json points `types` at index.ts and nothing reads a
  // bundled .d.ts. Generating them ran 26 entries through rollup-plugin-dts,
  // each dragging in the React, framer-motion, Radix and lucide type graphs:
  // 2,316MB peak against 236MB for the rest of the build, which is what put
  // the apps/web image build over the memory limit on the smaller box
  // (`ERR_WORKER_OUT_OF_MEMORY`, tsup runs the dts pass in a worker thread).
  // Re-enable it only alongside publishing this package, and expect to give
  // the builder ~3GB if you do.
  splitting: true,
  clean: true,
  sourcemap: true,
  minify: false,
  treeshake: true,
  target: "es2022",
  external: ["react", "react-dom"],
});

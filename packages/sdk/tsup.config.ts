import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server/index.ts",
  },
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  clean: true,
  sourcemap: true,
  minify: false,
  treeshake: true,
  target: "es2022",
  external: [
    "viem",
    "@noble/curves",
    "@quillai-network/wachai-validation-sdk",
    "@coinbase/cdp-sdk",
  ],
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
  },
});

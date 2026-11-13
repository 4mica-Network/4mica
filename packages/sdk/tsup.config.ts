import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  entry: {
    index: "src/index.ts",
    app: "src/app/index.ts",
    networks: "src/networks/index.ts",
    amounts: "src/amounts/index.ts",
  },
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: true,
  // Shared chunks keep `instanceof` working across entry points.
  splitting: true,
  clean: true,
  sourcemap: true,
  minify: false,
  treeshake: true,
  target: "es2022",
  external: [
    "viem",
    "@quillai-network/wachai-validation-sdk",
    "@coinbase/cdp-sdk",
  ],
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
  },
});

import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node22",
  dts: false,
  splitting: false,
  clean: true,
  sourcemap: true,
  minify: false,
  treeshake: true,
  // Both ship raw TypeScript rather than a build, so they have to be inlined.
  noExternal: ["@4mica/email-client", "@4mica/url"],
  external: [
    "@fastify/swagger-ui",
    "@react-email/components",
    "react",
    "react-dom",
    "resend",
  ],
});

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
  // Workspace packages ship raw TS (their `exports` point at src/), so they
  // have to be bundled rather than resolved at runtime. axios stays external —
  // it is a real dependency of @4mica/email-client and of apps/be.
  noExternal: ["@4mica/db", "@4mica/auth", "@4mica/email-client", "@4mica/url"],
  external: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "@fastify/swagger-ui",
    "@clerk/backend",
  ],
});

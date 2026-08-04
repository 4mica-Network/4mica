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
  noExternal: ["@4mica/db", "@4mica/auth"],
  external: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "@fastify/swagger-ui",
    "@clerk/backend",
  ],
});

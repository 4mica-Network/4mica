import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({
  path: fileURLToPath(new URL("../../apps/be/.env", import.meta.url)),
  quiet: true,
});
loadEnv({ quiet: true });

const UNCONFIGURED_URL = "postgresql://unset:unset@127.0.0.1:1/unset";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "pnpm --filter @4mica/seed run seed",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? UNCONFIGURED_URL,
  },
});

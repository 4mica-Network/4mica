import "server-only";

import * as v from "valibot";
import { format } from "./env";

const LOG_LEVELS = ["error", "warn", "info", "http", "debug"] as const;

const PortSchema = v.pipe(
  v.string(),
  v.transform(Number),
  v.number("PORT must be numeric"),
  v.integer("PORT must be an integer"),
  v.minValue(1),
  v.maxValue(65535),
);

const ServerEnvSchema = v.object({
  NODE_ENV: v.picklist(["development", "test", "production"]),
  PORT: PortSchema,
  LOG_LEVEL: v.picklist(LOG_LEVELS),
  LOG_DIR: v.pipe(v.string(), v.minLength(1)),
  DATABASE_URL: v.pipe(
    v.string(),
    v.startsWith("postgres", "DATABASE_URL must be a postgres:// URL"),
  ),
  CLERK_SECRET_KEY: v.pipe(
    v.string(),
    v.startsWith("sk_", "CLERK_SECRET_KEY must start with sk_"),
  ),
  REVALIDATE_SECRET: v.union([
    v.literal(""),
    v.pipe(
      v.string(),
      v.minLength(32, "REVALIDATE_SECRET must be at least 32 characters"),
    ),
  ]),
});

export type ServerEnv = v.InferOutput<typeof ServerEnvSchema>;

export const parseEnv = (source: NodeJS.ProcessEnv): ServerEnv => {
  const result = v.safeParse(ServerEnvSchema, {
    NODE_ENV: source.NODE_ENV ?? "development",
    PORT: source.PORT ?? "3100",
    LOG_LEVEL: source.LOG_LEVEL ?? "info",
    LOG_DIR: source.LOG_DIR ?? "logs",
    DATABASE_URL: source.DATABASE_URL ?? "",
    CLERK_SECRET_KEY: source.CLERK_SECRET_KEY ?? "",
    REVALIDATE_SECRET: source.REVALIDATE_SECRET ?? "",
  });

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${format(result.issues)}`,
    );
  }

  return result.output;
};

let cached: ServerEnv | undefined;

export const serverEnv = (): ServerEnv => {
  cached ??= parseEnv(process.env);
  return cached;
};

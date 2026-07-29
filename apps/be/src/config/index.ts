import "dotenv/config";
import * as v from "valibot";

const LOG_LEVELS = ["error", "warn", "info", "http", "debug"] as const;

const PortSchema = v.pipe(
  v.string(),
  v.transform(Number),
  v.number("PORT must be numeric"),
  v.integer("PORT must be an integer"),
  v.minValue(1),
  v.maxValue(65535),
);

const EnvSchema = v.object({
  NODE_ENV: v.picklist(["development", "test", "production"]),
  HOST: v.pipe(v.string(), v.minLength(1)),
  PORT: PortSchema,
  LOG_LEVEL: v.picklist(LOG_LEVELS),
  LOG_DIR: v.pipe(v.string(), v.minLength(1)),
  DATABASE_URL: v.pipe(
    v.string(),
    v.startsWith("postgres", "DATABASE_URL must be a postgres:// URL"),
  ),
  CORS_ORIGINS: v.string(),
});

export type Env = v.InferOutput<typeof EnvSchema>;

const parseEnv = (source: NodeJS.ProcessEnv): Env => {
  const result = v.safeParse(EnvSchema, {
    NODE_ENV: source.NODE_ENV ?? "development",
    HOST: source.HOST ?? "0.0.0.0",
    PORT: source.PORT ?? "4000",
    LOG_LEVEL: source.LOG_LEVEL ?? "info",
    LOG_DIR: source.LOG_DIR ?? "logs",
    DATABASE_URL: source.DATABASE_URL ?? "",
    CORS_ORIGINS: source.CORS_ORIGINS ?? "",
  });

  if (!result.success) {
    const issues = result.issues
      .map(
        (issue) => `  - ${v.getDotPath(issue) ?? "(root)"}: ${issue.message}`,
      )
      .join("\n");

    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.output;
};

const env = parseEnv(process.env);

export const config = {
  env,
  isDev: env.NODE_ENV === "development",
  isTest: env.NODE_ENV === "test",
  isProd: env.NODE_ENV === "production",
  extraCorsOrigins: env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

import "dotenv/config";
import * as v from "valibot";

const LOG_LEVELS = ["error", "warn", "info", "http", "debug"] as const;

const numeric = (name: string, min: number, max: number) =>
  v.pipe(
    v.string(),
    v.transform(Number),
    v.number(`${name} must be numeric`),
    v.integer(`${name} must be an integer`),
    v.minValue(min, `${name} must be at least ${min}`),
    v.maxValue(max, `${name} must be at most ${max}`),
  );

const EnvSchema = v.object({
  NODE_ENV: v.picklist(["development", "test", "production"]),
  HOST: v.pipe(v.string(), v.minLength(1)),
  PORT: numeric("PORT", 1, 65535),
  LOG_LEVEL: v.picklist(LOG_LEVELS),
  LOG_DIR: v.pipe(v.string(), v.minLength(1)),
  DATABASE_URL: v.pipe(
    v.string(),
    v.startsWith("postgres", "DATABASE_URL must be a postgres:// URL"),
  ),
  CORS_ORIGINS: v.string(),
  CLERK_PUBLISHABLE_KEY: v.pipe(
    v.string(),
    v.startsWith("pk_", "CLERK_PUBLISHABLE_KEY must start with pk_"),
  ),
  CLERK_SECRET_KEY: v.pipe(
    v.string(),
    v.startsWith("sk_", "CLERK_SECRET_KEY must start with sk_"),
  ),
  CLERK_JWT_KEY: v.string(),
  CLERK_AUTHORIZED_PARTIES: v.string(),
  SHUTDOWN_DRAIN_MS: numeric("SHUTDOWN_DRAIN_MS", 0, 60_000),
  SHUTDOWN_TIMEOUT_MS: numeric("SHUTDOWN_TIMEOUT_MS", 1_000, 120_000),
  RATE_LIMIT_ENABLED: v.picklist(
    ["true", "false"],
    'RATE_LIMIT_ENABLED must be "true" or "false"',
  ),
  RATE_LIMIT_WINDOW_MS: numeric("RATE_LIMIT_WINDOW_MS", 1_000, 3_600_000),
  RATE_LIMIT_IP_MAX: numeric("RATE_LIMIT_IP_MAX", 1, 1_000_000),
  RATE_LIMIT_USER_MAX: numeric("RATE_LIMIT_USER_MAX", 1, 1_000_000),
  RATE_LIMIT_SENSITIVE_MAX: numeric("RATE_LIMIT_SENSITIVE_MAX", 1, 10_000),
});

export type Env = v.InferOutput<typeof EnvSchema>;

export const parseEnv = (source: NodeJS.ProcessEnv): Env => {
  const result = v.safeParse(EnvSchema, {
    NODE_ENV: source.NODE_ENV ?? "development",
    HOST: source.HOST ?? "0.0.0.0",
    PORT: source.PORT ?? "4000",
    LOG_LEVEL: source.LOG_LEVEL ?? "info",
    LOG_DIR: source.LOG_DIR ?? "logs",
    DATABASE_URL: source.DATABASE_URL ?? "",
    CORS_ORIGINS: source.CORS_ORIGINS ?? "",
    CLERK_PUBLISHABLE_KEY: source.CLERK_PUBLISHABLE_KEY ?? "",
    CLERK_SECRET_KEY: source.CLERK_SECRET_KEY ?? "",
    CLERK_JWT_KEY: source.CLERK_JWT_KEY ?? "",
    CLERK_AUTHORIZED_PARTIES: source.CLERK_AUTHORIZED_PARTIES ?? "",
    SHUTDOWN_DRAIN_MS: source.SHUTDOWN_DRAIN_MS ?? "5000",
    SHUTDOWN_TIMEOUT_MS: source.SHUTDOWN_TIMEOUT_MS ?? "20000",
    RATE_LIMIT_ENABLED:
      source.RATE_LIMIT_ENABLED ??
      (source.NODE_ENV === "test" ? "false" : "true"),
    RATE_LIMIT_WINDOW_MS: source.RATE_LIMIT_WINDOW_MS ?? "60000",
    RATE_LIMIT_IP_MAX: source.RATE_LIMIT_IP_MAX ?? "300",
    RATE_LIMIT_USER_MAX: source.RATE_LIMIT_USER_MAX ?? "120",
    RATE_LIMIT_SENSITIVE_MAX: source.RATE_LIMIT_SENSITIVE_MAX ?? "10",
  });

  if (!result.success) {
    const issues = result.issues
      .map(
        (issue) => `  - ${v.getDotPath(issue) ?? "(root)"}: ${issue.message}`,
      )
      .join("\n");

    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  if (result.output.SHUTDOWN_DRAIN_MS >= result.output.SHUTDOWN_TIMEOUT_MS) {
    throw new Error(
      "Invalid environment configuration:\n  - SHUTDOWN_DRAIN_MS: must be less than SHUTDOWN_TIMEOUT_MS",
    );
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
  clerkJwtKey: env.CLERK_JWT_KEY
    ? env.CLERK_JWT_KEY.replace(/\\n/g, "\n")
    : undefined,
  clerkAuthorizedParties: env.CLERK_AUTHORIZED_PARTIES.split(",")
    .map((party) => party.trim())
    .filter(Boolean),
  shutdown: {
    drainMs: env.SHUTDOWN_DRAIN_MS,
    timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  },
  rateLimit: {
    enabled: env.RATE_LIMIT_ENABLED === "true",
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    ipMax: env.RATE_LIMIT_IP_MAX,
    userMax: env.RATE_LIMIT_USER_MAX,
    sensitiveMax: env.RATE_LIMIT_SENSITIVE_MAX,
  },
} as const;

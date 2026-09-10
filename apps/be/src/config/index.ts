import "dotenv/config";
import { LinkConfig } from "@4mica/url";
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
  // Optional on purpose. Empty disables sending rather than failing boot, so
  // local dev and tests need no email service running.
  EMAIL_SERVICE_URL: v.union([
    v.literal(""),
    v.pipe(
      v.string(),
      v.startsWith("http", "EMAIL_SERVICE_URL must be an http(s) URL"),
    ),
  ]),
  PUBLIC_API_URL: v.union([
    v.literal(""),
    v.pipe(
      v.string(),
      v.startsWith("http", "PUBLIC_API_URL must be an http(s) URL"),
    ),
  ]),
  // Optional on purpose, like EMAIL_SERVICE_URL: empty disables the onboarding
  // drip rather than failing boot, so local dev and tests need no Redis.
  REDIS_URL: v.union([
    v.literal(""),
    v.pipe(
      v.string(),
      v.startsWith("redis", "REDIS_URL must be a redis:// or rediss:// URL"),
    ),
  ]),
  // HMAC key for one-click unsubscribe links. Without it the drip does not run:
  // sending marketing mail whose unsubscribe link cannot work is not an option.
  UNSUBSCRIBE_SECRET: v.string(),
  ONBOARDING_TICK_MS: numeric("ONBOARDING_TICK_MS", 10_000, 3_600_000),
  ONBOARDING_BATCH_SIZE: numeric("ONBOARDING_BATCH_SIZE", 1, 500),
  ONBOARDING_STEP_GAP_MS: numeric(
    "ONBOARDING_STEP_GAP_MS",
    60_000,
    2_592_000_000,
  ),
  // Users created before this instant are never enrolled. Set it to a future
  // date to arm the drip without sending anything — the deploy's kill switch.
  ONBOARDING_DRIP_EPOCH: v.pipe(
    v.string(),
    v.isoTimestamp("ONBOARDING_DRIP_EPOCH must be an ISO 8601 timestamp"),
  ),
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
    EMAIL_SERVICE_URL: source.EMAIL_SERVICE_URL ?? "",
    PUBLIC_API_URL: source.PUBLIC_API_URL ?? "",
    REDIS_URL: source.REDIS_URL ?? "",
    UNSUBSCRIBE_SECRET: source.UNSUBSCRIBE_SECRET ?? "",
    ONBOARDING_TICK_MS: source.ONBOARDING_TICK_MS ?? "300000",
    ONBOARDING_BATCH_SIZE: source.ONBOARDING_BATCH_SIZE ?? "25",
    // 3 days
    ONBOARDING_STEP_GAP_MS: source.ONBOARDING_STEP_GAP_MS ?? "259200000",
    ONBOARDING_DRIP_EPOCH:
      source.ONBOARDING_DRIP_EPOCH ?? "2026-09-15T00:00:00.000Z",
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

  // Only enforced once the drip is actually armed. A weak HMAC key would make
  // unsubscribe links forgeable for arbitrary user ids.
  if (
    result.output.REDIS_URL &&
    result.output.UNSUBSCRIBE_SECRET.length > 0 &&
    result.output.UNSUBSCRIBE_SECRET.length < 32
  ) {
    throw new Error(
      "Invalid environment configuration:\n  - UNSUBSCRIBE_SECRET: must be at least 32 characters",
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
  /** `undefined` when unset — see src/services/email.ts. */
  emailServiceUrl: env.EMAIL_SERVICE_URL || undefined,
  publicApiUrl: env.PUBLIC_API_URL || `http://localhost:${env.PORT}`,
  appUrl: new LinkConfig(process.env).appBase,
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
  onboarding: {
    /** `undefined` when unset — see src/jobs/onboarding/index.ts. */
    redisUrl: env.REDIS_URL || undefined,
    unsubscribeSecret: env.UNSUBSCRIBE_SECRET || undefined,
    /** Both halves are required: no working unsubscribe means no sending. */
    enabled: Boolean(env.REDIS_URL && env.UNSUBSCRIBE_SECRET),
    tickMs: env.ONBOARDING_TICK_MS,
    batchSize: env.ONBOARDING_BATCH_SIZE,
    stepGapMs: env.ONBOARDING_STEP_GAP_MS,
    epoch: new Date(env.ONBOARDING_DRIP_EPOCH),
  },
} as const;

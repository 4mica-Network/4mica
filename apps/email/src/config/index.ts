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

const boolish = (name: string) =>
  v.picklist(["true", "false"], `${name} must be "true" or "false"`);

const EnvSchema = v.object({
  NODE_ENV: v.picklist(["development", "test", "production"]),
  HOST: v.pipe(v.string(), v.minLength(1)),
  PORT: numeric("PORT", 1, 65535),
  LOG_LEVEL: v.picklist(LOG_LEVELS),
  LOG_DIR: v.pipe(v.string(), v.minLength(1)),
  RESEND_API_KEY: v.string(),
  EMAIL_DRY_RUN: boolish("EMAIL_DRY_RUN"),
  EMAIL_FROM_NAME: v.pipe(v.string(), v.minLength(1)),
  EMAIL_FROM_ADDRESS: v.pipe(
    v.string(),
    v.email("EMAIL_FROM_ADDRESS must be a valid email address"),
  ),
  EMAIL_REPLY_TO: v.pipe(
    v.string(),
    v.email("EMAIL_REPLY_TO must be a valid email address"),
  ),
  SHUTDOWN_DRAIN_MS: numeric("SHUTDOWN_DRAIN_MS", 0, 60_000),
  SHUTDOWN_TIMEOUT_MS: numeric("SHUTDOWN_TIMEOUT_MS", 1_000, 120_000),
  RATE_LIMIT_ENABLED: boolish("RATE_LIMIT_ENABLED"),
  RATE_LIMIT_WINDOW_MS: numeric("RATE_LIMIT_WINDOW_MS", 1_000, 3_600_000),
  RATE_LIMIT_IP_MAX: numeric("RATE_LIMIT_IP_MAX", 1, 1_000_000),
});

export type Env = v.InferOutput<typeof EnvSchema>;

export const parseEnv = (source: NodeJS.ProcessEnv): Env => {
  const nodeEnv = source.NODE_ENV ?? "development";

  const result = v.safeParse(EnvSchema, {
    NODE_ENV: nodeEnv,
    HOST: source.HOST ?? "0.0.0.0",
    PORT: source.PORT ?? "4100",
    LOG_LEVEL: source.LOG_LEVEL ?? "info",
    LOG_DIR: source.LOG_DIR ?? "logs",
    RESEND_API_KEY: source.RESEND_API_KEY ?? "",
    EMAIL_DRY_RUN:
      source.EMAIL_DRY_RUN ?? (nodeEnv === "production" ? "false" : "true"),
    EMAIL_FROM_NAME: source.EMAIL_FROM_NAME ?? "4Mica",
    EMAIL_FROM_ADDRESS: source.EMAIL_FROM_ADDRESS ?? "no-reply@4mica.io",
    EMAIL_REPLY_TO: source.EMAIL_REPLY_TO ?? "support@4mica.io",
    SHUTDOWN_DRAIN_MS: source.SHUTDOWN_DRAIN_MS ?? "5000",
    SHUTDOWN_TIMEOUT_MS: source.SHUTDOWN_TIMEOUT_MS ?? "20000",
    RATE_LIMIT_ENABLED:
      source.RATE_LIMIT_ENABLED ?? (nodeEnv === "test" ? "false" : "true"),
    RATE_LIMIT_WINDOW_MS: source.RATE_LIMIT_WINDOW_MS ?? "60000",
    RATE_LIMIT_IP_MAX: source.RATE_LIMIT_IP_MAX ?? "300",
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

  if (
    result.output.EMAIL_DRY_RUN === "false" &&
    !result.output.RESEND_API_KEY.startsWith("re_")
  ) {
    throw new Error(
      "Invalid environment configuration:\n  - RESEND_API_KEY: must start with re_ unless EMAIL_DRY_RUN is true",
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
  email: {
    dryRun: env.EMAIL_DRY_RUN === "true",
    apiKey: env.RESEND_API_KEY,
    from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`,
    replyTo: env.EMAIL_REPLY_TO,
  },
  shutdown: {
    drainMs: env.SHUTDOWN_DRAIN_MS,
    timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  },
  rateLimit: {
    enabled: env.RATE_LIMIT_ENABLED === "true",
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    ipMax: env.RATE_LIMIT_IP_MAX,
  },
} as const;

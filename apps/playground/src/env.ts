import * as v from "valibot";

/**
 * Environment parsing, mirroring apps/be/src/config/index.ts: every key is
 * defaulted at the call site, one safeParse, issues rendered with getDotPath.
 *
 * The Next-specific twist is the public/server split. Next only inlines
 * `process.env.NEXT_PUBLIC_*` for *literal* member accesses — reading through a
 * parameter (`source.NEXT_PUBLIC_X`) is not rewritten and comes back undefined
 * in the browser. So the public object below is built from literals, and no
 * secret is ever referenced through a NEXT_PUBLIC_ name.
 */

const LOG_LEVELS = ["error", "warn", "info", "http", "debug"] as const;

const PortSchema = v.pipe(
  v.string(),
  v.transform(Number),
  v.number("PORT must be numeric"),
  v.integer("PORT must be an integer"),
  v.minValue(1),
  v.maxValue(65535),
);

const format = (issues: v.BaseIssue<unknown>[]): string =>
  issues
    .map((issue) => `  - ${v.getDotPath(issue) ?? "(root)"}: ${issue.message}`)
    .join("\n");

// -- Public -----------------------------------------------------------------

const PublicEnvSchema = v.object({
  NEXT_PUBLIC_BASE_URL: v.pipe(v.string(), v.url("must be an absolute URL")),
  NEXT_PUBLIC_APP_URL: v.pipe(v.string(), v.url("must be an absolute URL")),
  NEXT_PUBLIC_ASSET_PREFIX: v.string(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: v.pipe(
    v.string(),
    v.startsWith("pk_", "must start with pk_"),
  ),
});

export type PublicEnv = v.InferOutput<typeof PublicEnvSchema>;

export const parsePublicEnv = (source: {
  NEXT_PUBLIC_BASE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_ASSET_PREFIX?: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
}): PublicEnv => {
  const base = source.NEXT_PUBLIC_BASE_URL || "https://4mica.io";
  const result = v.safeParse(PublicEnvSchema, {
    NEXT_PUBLIC_BASE_URL: base,
    NEXT_PUBLIC_APP_URL: source.NEXT_PUBLIC_APP_URL || base,
    NEXT_PUBLIC_ASSET_PREFIX: source.NEXT_PUBLIC_ASSET_PREFIX ?? "",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      source.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  });

  if (!result.success) {
    throw new Error(
      `Invalid public environment configuration:\n${format(result.issues)}`,
    );
  }

  return result.output;
};

/**
 * Eager, so a misconfigured deploy fails at boot rather than on first render.
 * The literal member accesses below are what Next rewrites at build time — do
 * not refactor them into a loop or a spread.
 */
export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ASSET_PREFIX: process.env.NEXT_PUBLIC_ASSET_PREFIX,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

// -- Server -----------------------------------------------------------------

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
  REVALIDATE_SECRET: v.string(),
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

/**
 * Lazy and memoised. Lazy because `next build` evaluates every route module
 * without a real database URL; memoised so repeated calls are free. Throws in
 * the browser so a stray client import fails loudly instead of shipping
 * `undefined` secrets.
 */
export const serverEnv = (): ServerEnv => {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() was called in the browser");
  }
  cached ??= parseEnv(process.env);
  return cached;
};

import * as v from "valibot";

export const format = (issues: v.BaseIssue<unknown>[]): string =>
  issues
    .map((issue) => `  - ${v.getDotPath(issue) ?? "(root)"}: ${issue.message}`)
    .join("\n");

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

const APPROVED_DOMAIN = "4mica.io";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const EDGE_ASSET_PREFIX = "/p";

const isLocal = (url: URL): boolean => LOCAL_HOSTS.has(url.hostname);

const isApproved = (url: URL): boolean =>
  url.hostname === APPROVED_DOMAIN ||
  url.hostname.endsWith(`.${APPROVED_DOMAIN}`);

const deployIssues = (env: PublicEnv): string[] => {
  const issues: string[] = [];
  const base = new URL(env.NEXT_PUBLIC_BASE_URL);

  for (const key of ["NEXT_PUBLIC_BASE_URL", "NEXT_PUBLIC_APP_URL"] as const) {
    const url = new URL(env[key]);

    if (isLocal(url)) {
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        issues.push(`  - ${key}: must use http: or https:`);
      }
    } else if (url.protocol !== "https:") {
      issues.push(`  - ${key}: must use https: in a deployed build`);
    } else if (!isApproved(url)) {
      issues.push(
        `  - ${key}: host ${url.hostname} is not ${APPROVED_DOMAIN} or one of its subdomains`,
      );
    }
  }

  if (!isLocal(base) && env.NEXT_PUBLIC_ASSET_PREFIX !== EDGE_ASSET_PREFIX) {
    issues.push(
      `  - NEXT_PUBLIC_ASSET_PREFIX: must be ${EDGE_ASSET_PREFIX} behind the 4mica.io edge, got "${env.NEXT_PUBLIC_ASSET_PREFIX}"`,
    );
  }

  return issues;
};

export const parsePublicEnv = (
  source: {
    NEXT_PUBLIC_BASE_URL?: string;
    NEXT_PUBLIC_APP_URL?: string;
    NEXT_PUBLIC_ASSET_PREFIX?: string;
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  },
  { strict = process.env.PLAYGROUND_STRICT_ENV === "1" } = {},
): PublicEnv => {
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

  const issues = strict ? deployIssues(result.output) : [];

  if (issues.length > 0) {
    throw new Error(
      `Invalid public environment configuration:\n${issues.join("\n")}`,
    );
  }

  return result.output;
};

export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ASSET_PREFIX: process.env.NEXT_PUBLIC_ASSET_PREFIX,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

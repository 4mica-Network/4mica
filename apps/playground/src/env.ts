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

export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ASSET_PREFIX: process.env.NEXT_PUBLIC_ASSET_PREFIX,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

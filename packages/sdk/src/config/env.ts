import { ConfigError } from "@/errors";

// Shells cannot `export` a name starting with a digit, hence `FOURMICA_`.
const ENV_PREFIXES = ["FOURMICA_", "4MICA_"] as const;

export function readEnv(
  env: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const [preferred, legacy] = ENV_PREFIXES.map((prefix) => env[prefix + name]);
  if (preferred && legacy && preferred !== legacy) {
    throw new ConfigError(
      `FOURMICA_${name} and 4MICA_${name} are both set, to different values; ` +
        "unset one of them",
    );
  }
  return preferred || legacy || undefined;
}

export function defaultEnv(): Record<string, string | undefined> {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {}
  );
}

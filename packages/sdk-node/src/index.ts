import type { Config } from "@4mica/sdk";
import { Client, ConfigBuilder } from "@4mica/sdk";
import type {
  Paywall,
  PaywallConfig,
  PaywallVerifier,
} from "@4mica/sdk/server";
import { createPaywall as coreCreatePaywall } from "@4mica/sdk/server";

/** Options for the Node env-driven factories. */
export interface CreateClientOptions {
  /** Environment source. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /** Hook to tweak the builder after env is applied (e.g. `.network("base")`). */
  configure?: (builder: ConfigBuilder) => ConfigBuilder;
}

function nodeEnv(): Record<string, string | undefined> {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {}
  );
}

/** Build a validated {@link Config} from `process.env` (+ optional overrides). */
export function buildConfig(options: CreateClientOptions = {}): Config {
  const builder = new ConfigBuilder().fromEnv(options.env ?? nodeEnv());
  return (options.configure ? options.configure(builder) : builder).build();
}

/**
 * Create a fully-initialised {@link Client} from `process.env`.
 *
 * Reads `4MICA_*` variables (see {@link ConfigBuilder.fromEnv}) and connects to
 * the core service. Pass `configure` to override any field programmatically.
 */
export async function createClient(
  options: CreateClientOptions = {},
): Promise<Client> {
  return Client.connect(buildConfig(options));
}

/**
 * Convenience factory: build a client from the environment and wrap it as an
 * x402 {@link Paywall}. For DI (tests, shared clients), pass an existing
 * verifier to {@link createPaywallFor} instead.
 */
export async function createPaywall(
  config: PaywallConfig,
  options?: CreateClientOptions,
): Promise<Paywall> {
  const client = await createClient(options);
  return coreCreatePaywall(client, config);
}

/** Wrap an already-built verifier (`client`, `client.rpc`, …) as a paywall. */
export function createPaywallFor(
  verifier: PaywallVerifier,
  config: PaywallConfig,
): Paywall {
  return coreCreatePaywall(verifier, config);
}

export * from "@4mica/sdk";
export * as server from "@4mica/sdk/server";

import type { Config } from "@4mica/sdk";
import { Client, ConfigBuilder } from "@4mica/sdk";
import type {
  Paywall,
  PaywallConfig,
  PaywallVerifier,
} from "@4mica/sdk/server";
import { createPaywall as coreCreatePaywall } from "@4mica/sdk/server";

// Minimal ambient declaration so we can read `Deno.env` without a hard dep on
// Deno's type definitions. Present at runtime under Deno; guarded otherwise.
declare const Deno: { env: { toObject(): Record<string, string> } } | undefined;

/** Options for the Deno env-driven factories. */
export interface CreateClientOptions {
  /** Environment source. Defaults to `Deno.env.toObject()`. */
  env?: Record<string, string | undefined>;
  /** Hook to tweak the builder after env is applied (e.g. `.network("base")`). */
  configure?: (builder: ConfigBuilder) => ConfigBuilder;
}

function denoEnv(): Record<string, string | undefined> {
  return typeof Deno !== "undefined" ? Deno.env.toObject() : {};
}

/** Build a validated {@link Config} from `Deno.env` (+ optional overrides). */
export function buildConfig(options: CreateClientOptions = {}): Config {
  const builder = new ConfigBuilder().fromEnv(options.env ?? denoEnv());
  return (options.configure ? options.configure(builder) : builder).build();
}

/** Create a fully-initialised {@link Client} from `Deno.env`. */
export async function createClient(
  options: CreateClientOptions = {},
): Promise<Client> {
  return Client.connect(buildConfig(options));
}

/** Convenience factory: build a client from `Deno.env` and wrap it as a paywall. */
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

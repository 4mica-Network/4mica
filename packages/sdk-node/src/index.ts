import type { Config } from "@4mica/sdk";
import { Client, ConfigBuilder } from "@4mica/sdk";
import type {
  Paywall,
  PaywallConfig,
  PaywallVerifier,
} from "@4mica/sdk/server";
import { createPaywall as coreCreatePaywall } from "@4mica/sdk/server";

export interface CreateClientOptions {
  env?: Record<string, string | undefined>;
  configure?: (builder: ConfigBuilder) => ConfigBuilder;
}

function nodeEnv(): Record<string, string | undefined> {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {}
  );
}

export function buildConfig(options: CreateClientOptions = {}): Config {
  const builder = new ConfigBuilder().fromEnv(options.env ?? nodeEnv());
  return (options.configure ? options.configure(builder) : builder).build();
}

export async function createClient(
  options: CreateClientOptions = {},
): Promise<Client> {
  return Client.connect(buildConfig(options));
}

export async function createPaywall(
  config: PaywallConfig,
  options?: CreateClientOptions,
): Promise<Paywall> {
  const client = await createClient(options);
  return coreCreatePaywall(client, config);
}

export function createPaywallFor(
  verifier: PaywallVerifier,
  config: PaywallConfig,
): Paywall {
  return coreCreatePaywall(verifier, config);
}

export * from "@4mica/sdk";
export * as server from "@4mica/sdk/server";

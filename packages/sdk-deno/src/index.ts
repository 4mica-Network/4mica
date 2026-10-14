import type { Config } from "@4mica/sdk";
import { Client, ConfigBuilder, ConfigError } from "@4mica/sdk";
import type { AppClient } from "@4mica/sdk/app";
import { createAppClient as coreCreateAppClient } from "@4mica/sdk/app";
import type {
  Paywall,
  PaywallConfig,
  PaywallVerifier,
} from "@4mica/sdk/server";
import { createPaywall as coreCreatePaywall } from "@4mica/sdk/server";

declare const Deno: { env: { toObject(): Record<string, string> } } | undefined;

export interface CreateClientOptions {
  env?: Record<string, string | undefined>;
  configure?: (builder: ConfigBuilder) => ConfigBuilder;
}

function denoEnv(): Record<string, string | undefined> {
  return typeof Deno !== "undefined" ? Deno.env.toObject() : {};
}

export function buildConfig(options: CreateClientOptions = {}): Config {
  const builder = new ConfigBuilder().fromEnv(options.env ?? denoEnv());
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

export interface CreateAppClientOptions {
  env?: Record<string, string | undefined>;
  apiKey?: string;
  baseUrl?: string;
}

export function createAppClient(
  options: CreateAppClientOptions = {},
): AppClient {
  const env = options.env ?? denoEnv();
  const apiKey = options.apiKey ?? env.FOURMICA_API_KEY;
  if (!apiKey) {
    throw new ConfigError("FOURMICA_API_KEY is not set");
  }
  return coreCreateAppClient({
    apiKey,
    baseUrl: options.baseUrl ?? env.FOURMICA_API_URL,
  });
}

export * from "@4mica/sdk";
export * as app from "@4mica/sdk/app";
export * as server from "@4mica/sdk/server";

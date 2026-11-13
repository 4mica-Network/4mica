import "dotenv/config";
import type { Network } from "@4mica/x402";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((value) => value || undefined);

const Env = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().default(3020),
  NETWORK: z.string().default("eip155:84532"),
  /** Receives every cap and signs every refund, so it needs 4mica collateral of its own. */
  SELLER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "a 0x-prefixed 32-byte hex key"),
  /** What the buyer pays for one Firecrawl credit. */
  CREDIT_PRICE: z.string().default("$0.002"),
  PROXY_URL: z.string().url().default("http://localhost:8080"),
  PROXY_TOKEN: z.string().min(1),
  FACILITATOR_URL: optional,
  CORE_URL: optional,
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Env.parse(env);
  return {
    ...parsed,
    network: parsed.NETWORK as Network,
    signer: privateKeyToAccount(parsed.SELLER_PRIVATE_KEY as `0x${string}`),
  };
}

export type Config = ReturnType<typeof loadConfig>;

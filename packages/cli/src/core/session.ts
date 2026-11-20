import type { FourMica } from "@4mica/sdk";
import { configError, noSigner } from "../errors.js";
import type { Settings } from "./settings.js";

const KEY = "FOURMICA_WALLET_PRIVATE_KEY";

function requireKey(settings: Settings): string {
  const key = settings.sdkEnv[KEY];
  if (!key) throw noSigner();
  return key;
}

/** No network call. The key is never echoed, even when it is malformed. */
export async function walletAddress(settings: Settings): Promise<string> {
  const key = requireKey(settings);
  const { privateKeyToAccount } = await import("viem/accounts");
  try {
    return privateKeyToAccount(
      (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`,
    ).address;
  } catch {
    throw configError(`${KEY} is not a valid private key`, {
      code: "BAD_SIGNER",
      suggestions: ["it should be 64 hex characters, with or without 0x"],
    });
  }
}

/**
 * The SDK is imported here, on first use, so that commands which never
 * connect (`--help`, `init`, `networks`) do not pay for loading viem.
 */
export async function connect(settings: Settings): Promise<FourMica> {
  requireKey(settings);
  const { FourMica } = await import("@4mica/sdk");
  return FourMica.connect({
    env: settings.sdkEnv,
    ...(settings.network
      ? { network: settings.network.value }
      : { rpcUrl: settings.rpcUrl.value }),
    facilitatorUrl: settings.facilitatorUrl?.value,
  });
}

export async function withSession<T>(
  settings: Settings,
  use: (client: FourMica) => Promise<T>,
): Promise<T> {
  const client = await connect(settings);
  try {
    return await use(client);
  } finally {
    await client.close();
  }
}

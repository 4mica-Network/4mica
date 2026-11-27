import type { FourMica, SpendLimits } from "@4mica/sdk";
import { noSigner } from "../errors.js";
import { waiting } from "../ui/log.js";
import {
  assertMainnetWasChosen,
  networkName,
  type Settings,
} from "./settings.js";
import { addressFromKey } from "./wallets.js";

const KEY = "FOURMICA_WALLET_PRIVATE_KEY";

function requireKey(settings: Settings): string {
  const key = settings.sdkEnv[KEY];
  if (!key) throw settings.keyProblem ?? noSigner(settings.envFilePath);
  return key;
}

export const walletKey = (settings: Settings): string => requireKey(settings);

/** No network call. */
export async function walletAddress(settings: Settings): Promise<string> {
  return addressFromKey(requireKey(settings), settings.key?.file ?? KEY);
}

/**
 * The SDK is imported here, on first use, so that commands which never
 * connect (`--help`, `init`, `networks`) do not pay for loading viem.
 */
export interface SessionOptions {
  /** Limits on what `client.fetch` may pay. */
  spend?: SpendLimits;
  /** The `fetch` that `client.fetch` sends through. */
  fetch?: typeof fetch;
}

export async function connect(
  settings: Settings,
  options: SessionOptions = {},
): Promise<FourMica> {
  requireKey(settings);
  assertMainnetWasChosen(settings);
  const { FourMica } = await import("@4mica/sdk");
  return FourMica.connect({
    env: settings.sdkEnv,
    ...(settings.network
      ? { network: settings.network.value }
      : { rpcUrl: settings.rpcUrl.value }),
    facilitatorUrl: settings.facilitatorUrl?.value,
    spend: options.spend,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

export async function withSession<T>(
  settings: Settings,
  use: (client: FourMica) => Promise<T>,
  options?: SessionOptions,
): Promise<T> {
  // Connecting logs in to core: a second or two with nothing else to show.
  const client = await waiting(`Connecting to ${networkName(settings)}`, () =>
    connect(settings, options),
  );
  try {
    return await use(client);
  } finally {
    await client.close();
  }
}

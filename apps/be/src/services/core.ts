import { Client, ConfigBuilder } from "@4mica/sdk";
import { config } from "@config/index";
import { createScopedLogger } from "@logger/index";

const logger = createScopedLogger("core");

let pending: Promise<Client | null> | undefined;

const connect = async (): Promise<Client | null> => {
  const { url, signerKey } = config.core;

  if (!url || !signerKey) {
    logger.warn(
      "CORE_URL or CORE_SIGNER_KEY is unset; 4mica core reads are disabled",
    );
    return null;
  }

  try {
    const client = await Client.connect(
      new ConfigBuilder().rpcUrl(url).walletPrivateKey(signerKey).build(),
    );
    logger.info("Connected to 4mica core", {
      url,
      chainId: client.publicParams.chainId,
      signer: client.signerAddress,
    });
    return client;
  } catch (error) {
    pending = undefined;
    throw error;
  }
};

export const getCoreClient = (): Promise<Client | null> => {
  pending ??= connect();
  return pending;
};

export const closeCoreClient = async (): Promise<void> => {
  const client = await pending?.catch(() => null);
  pending = undefined;
  await client?.aclose();
};

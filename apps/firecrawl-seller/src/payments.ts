import type { PaymentPayload, PaymentRequirements } from "@4mica/x402";
import { FourMicaEvmScheme as FourMicaPayer } from "@4mica/x402/client";
import {
  FourMicaEvmScheme,
  FourMicaFacilitatorClient,
  x402ResourceServer,
} from "@4mica/x402/server";
import { getAddress, isAddress } from "viem";
import type { Config } from "./config.js";

export async function createPayments(config: Config) {
  const coreUrls = config.CORE_URL
    ? { [config.network]: config.CORE_URL }
    : undefined;
  const facilitator = new FourMicaFacilitatorClient(
    config.FACILITATOR_URL ? { url: config.FACILITATOR_URL } : undefined,
  );
  const scheme = new FourMicaEvmScheme(coreUrls ? { coreUrls } : {});
  const server = new x402ResourceServer(facilitator).register(
    config.network,
    scheme,
  );
  // Learns which scheme and network pairs the facilitator serves.
  await server.initialize();

  const [perCredit] = await server.buildPaymentRequirements({
    scheme: scheme.scheme,
    network: config.network,
    payTo: config.signer.address,
    price: config.CREDIT_PRICE,
    // A scrape may take Firecrawl's full 300 s before the cap is settled.
    maxTimeoutSeconds: 600,
    ...(config.CORE_URL ? { extra: { rpcUrl: config.CORE_URL } } : {}),
  });
  if (!perCredit)
    throw new Error(`no ${scheme.scheme} requirements for ${config.network}`);

  // The seller pays refunds the way a buyer pays: a guarantee from its own wallet.
  const refunder = await FourMicaPayer.create(config.signer, {
    networks: [config.network],
    ...(coreUrls ? { coreUrls } : {}),
  });

  return {
    server,
    cap: (credits: number) => capFor(perCredit, credits),

    /** Pays `buyer` back what the call did not use of `cap`. Nothing when it used all of it. */
    async refund(
      cap: PaymentRequirements,
      buyer: string,
      usedCredits: number,
    ): Promise<string | undefined> {
      const amount = refundFor(cap, perCredit, usedCredits);
      if (amount === 0n) return undefined;
      const requirements = { ...cap, payTo: buyer, amount: amount.toString() };
      const signed = await refunder.createPaymentPayload(2, requirements);
      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "mcp://firecrawl/refund",
          description: "unused cap",
          mimeType: "",
        },
        accepted: requirements,
        payload: signed.payload,
      };
      const settled = await facilitator.settle(payload, requirements);
      if (!settled.success) {
        throw new Error(
          `refund not settled: ${settled.errorReason ?? settled.errorMessage}`,
        );
      }
      return requirements.amount;
    },
  };
}

export type Payments = Awaited<ReturnType<typeof createPayments>>;

export function capFor(
  perCredit: PaymentRequirements,
  credits: number,
): PaymentRequirements {
  return {
    ...perCredit,
    amount: (BigInt(perCredit.amount) * BigInt(credits)).toString(),
  };
}

/** The cap minus what `usedCredits` cost; 0 when they cost the cap or more. */
export function refundFor(
  cap: PaymentRequirements,
  perCredit: PaymentRequirements,
  usedCredits: number,
): bigint {
  const capAmount = BigInt(cap.amount);
  const used = BigInt(perCredit.amount) * BigInt(usedCredits);
  return used < capAmount ? capAmount - used : 0n;
}

/** The buyer: the `user_address` the 4mica payment in an MCP request's `_meta` was signed for. */
export function payerOf(
  meta: Record<string, unknown> | undefined,
): string | undefined {
  const payment = meta?.["x402/payment"] as {
    payload?: { payload?: Record<string, unknown> };
  };
  const address = payment?.payload?.payload?.user_address;
  return typeof address === "string" && isAddress(address)
    ? getAddress(address)
    : undefined;
}

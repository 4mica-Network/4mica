import type { Client } from "@/client";
import type { PaymentProtocol, PaymentTerms } from "@/facade/protocols/types";
import { resolveNetwork } from "@/networks";
import { isRecord } from "@/serde";
import { parseU256 } from "@/utils";
import { X402Flow } from "@/x402";
import { base64ToUtf8 } from "@/x402/base64";
import {
  type PaymentRequirements,
  PaymentRequirementsV1,
  PaymentRequirementsV2,
  SCHEME_4MICA_CREDIT,
  X402PaymentRequired,
} from "@/x402/models";

interface X402Offer {
  required: Record<string, unknown>;
  requirements: PaymentRequirements;
}

// v2 sends requirements in the `PAYMENT-REQUIRED` header, v1 in the body.
async function readRequired(
  response: Response,
): Promise<Record<string, unknown> | undefined> {
  const header = response.headers.get("PAYMENT-REQUIRED");
  try {
    const raw: unknown = JSON.parse(
      header ? base64ToUtf8(header.trim()) : await response.text(),
    );
    return isRecord(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

// The SDK's own paywall answers v1 with v2-shaped (`amount`) entries.
function requirementsOf(
  version: number,
  entry: Record<string, unknown>,
): PaymentRequirements {
  return version === 2
    ? PaymentRequirementsV2.fromRaw(entry)
    : PaymentRequirementsV1.fromRaw({
        ...entry,
        maxAmountRequired: entry.maxAmountRequired ?? entry.amount,
      });
}

export const x402Protocol: PaymentProtocol = {
  name: "x402",

  async terms(response: Response): Promise<PaymentTerms[]> {
    const required = await readRequired(response);
    const version = Number(required?.x402Version);
    if (!required || (version !== 1 && version !== 2)) return [];
    const accepts = Array.isArray(required.accepts) ? required.accepts : [];

    const terms: PaymentTerms[] = [];
    for (const entry of accepts) {
      if (!isRecord(entry) || entry.scheme !== SCHEME_4MICA_CREDIT) continue;
      let requirements: PaymentRequirements;
      let amount: bigint;
      try {
        requirements = requirementsOf(version, entry);
        amount = parseU256(requirements.amount);
      } catch {
        continue;
      }
      terms.push({
        protocol: "x402",
        network:
          resolveNetwork(requirements.network)?.info.caip2 ??
          requirements.network,
        asset: requirements.asset,
        amount,
        payTo: requirements.payTo,
        offer: { required, requirements } satisfies X402Offer,
      });
    }
    return terms;
  },

  async pay(
    terms: PaymentTerms,
    client: Client,
  ): Promise<Record<string, string>> {
    const { required, requirements } = terms.offer as X402Offer;
    const flow = X402Flow.fromClient(client);
    if (requirements instanceof PaymentRequirementsV2) {
      const signed = await flow.signPaymentV2(
        X402PaymentRequired.fromRaw(required),
        requirements,
      );
      return { "PAYMENT-SIGNATURE": signed.header };
    }
    const signed = await flow.signPayment(requirements);
    return { "X-PAYMENT": signed.header };
  },
};

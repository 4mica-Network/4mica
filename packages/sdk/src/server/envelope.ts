import { X402Error } from "@/errors";
import { base64ToUtf8 } from "@/server/base64";
import type { X402PaymentEnvelope } from "@/server/models";

/**
 * Decode a base64 `X-PAYMENT` header into its x402 payment envelope.
 *
 * Runtime-neutral and edge-safe (no `Buffer`). Shared by the payer-side
 * {@link X402Flow} and the server-side paywall so both agree on the wire format.
 *
 * @throws {@link X402Error} if the header is missing or not valid base64 JSON.
 */
export function parsePaymentHeader(header: string): X402PaymentEnvelope {
  if (!header || typeof header !== "string") {
    throw new X402Error("missing payment header");
  }
  try {
    const decoded = base64ToUtf8(header);
    return JSON.parse(decoded) as X402PaymentEnvelope;
  } catch (err) {
    throw new X402Error(`invalid payment header: ${String(err)}`);
  }
}

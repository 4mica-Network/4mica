import type { Client } from "@/client";

/** One payment option from a 402, independent of the protocol's wire format. */
export interface PaymentTerms {
  protocol: string;
  /** CAIP-2 id. */
  network: string;
  asset: string;
  amount: bigint;
  payTo: string;
  /** Adapter-private, handed back to `pay`. */
  offer: unknown;
}

export interface PaymentProtocol {
  readonly name: string;
  /** Empty when the 402 is not this protocol's. Receives a clone. */
  terms(response: Response): Promise<PaymentTerms[]>;
  /** Headers to retry with. */
  pay(terms: PaymentTerms, client: Client): Promise<Record<string, string>>;
  /** Whether the seller took the payment; `undefined` when it does not say. */
  settled(response: Response): boolean | undefined;
  reqId?(headers: Record<string, string>): string | undefined;
}

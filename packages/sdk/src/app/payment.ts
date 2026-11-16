import { formatUnits } from "@/amounts";
import { InvalidParamsError } from "@/errors";
import { parsePaymentHeader } from "@/x402/envelope";

export interface ParsedPayment {
  reqId: string;
  payerAddress: string;
  amountRaw: bigint;
  amount: string;
}

/** @deprecated Use `formatUnits` from `@4mica/sdk/amounts`. */
export const toDisplayAmount = formatUnits;

const asBigInt = (value: unknown): bigint | null => {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
};

export function paymentFromHeader(
  header: string,
  decimals = 18,
): ParsedPayment {
  const payment = (parsePaymentHeader(header).payload as { payload?: unknown })
    .payload as Record<string, unknown> | undefined;

  const reqId = payment?.req_id ?? payment?.reqId;
  const payerAddress = payment?.user_address ?? payment?.userAddress;
  const amountRaw = asBigInt(payment?.amount);

  if (
    typeof reqId !== "string" ||
    typeof payerAddress !== "string" ||
    amountRaw === null
  ) {
    throw new InvalidParamsError(
      "payment header is missing req_id, user_address or amount",
    );
  }

  return {
    reqId,
    payerAddress,
    amountRaw,
    amount: formatUnits(amountRaw, decimals),
  };
}

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

const readPayment = (payload: unknown, decimals: number): ParsedPayment => {
  const payment = (payload as { payload?: unknown } | undefined)?.payload as
    | Record<string, unknown>
    | undefined;

  const reqId = payment?.req_id ?? payment?.reqId;
  const payerAddress = payment?.user_address ?? payment?.userAddress;
  const amountRaw = asBigInt(payment?.amount);

  if (
    typeof reqId !== "string" ||
    typeof payerAddress !== "string" ||
    amountRaw === null
  ) {
    throw new InvalidParamsError(
      "payment is missing req_id, user_address or amount",
    );
  }

  return {
    reqId,
    payerAddress,
    amountRaw,
    amount: formatUnits(amountRaw, decimals),
  };
};

export function paymentFromHeader(
  header: string,
  decimals = 18,
): ParsedPayment {
  return readPayment(parsePaymentHeader(header).payload, decimals);
}

export interface SettlementContext {
  paymentPayload: { payload: unknown };
  result: { extra?: Record<string, unknown> };
}

export interface SettledPayment {
  reqId: string;
  payerAddress: string;
  amount: string;
  guaranteeClaims: string | null;
  guaranteeSignature: string | null;
}

export function parseSettlement({
  paymentPayload,
  result,
}: SettlementContext): SettledPayment {
  const { reqId, payerAddress, amountRaw } = readPayment(
    paymentPayload.payload,
    0,
  );
  const receipt = result.extra?.receipt as
    | { receipt?: unknown; signature?: unknown }
    | undefined;

  return {
    reqId,
    payerAddress,
    amount: amountRaw.toString(),
    guaranteeClaims:
      typeof receipt?.receipt === "string" ? receipt.receipt : null,
    guaranteeSignature:
      typeof receipt?.signature === "string" ? receipt.signature : null,
  };
}

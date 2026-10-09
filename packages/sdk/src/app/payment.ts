import { InvalidParamsError } from "@/errors";
import { parsePaymentHeader } from "@/server/envelope";

export interface ParsedPayment {
  reqId: string;
  payerAddress: string;
  amountRaw: bigint;
  amount: string;
}

export function toDisplayAmount(raw: bigint, decimals: number): string {
  if (decimals === 0) {
    return raw.toString();
  }

  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

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
  const claims = (parsePaymentHeader(header).payload as { claims?: unknown })
    .claims as Record<string, unknown> | undefined;

  const reqId = claims?.req_id ?? claims?.reqId;
  const payerAddress = claims?.user_address ?? claims?.userAddress;
  const amountRaw = asBigInt(claims?.amount);

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
    amount: toDisplayAmount(amountRaw, decimals),
  };
}

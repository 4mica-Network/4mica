import { parsePaymentHeader } from "@4mica/sdk/server";

export interface ReportConfig {
  baseUrl: string;
  apiKey: string;
  recipientAddress: string;
  network: string;
  assetAddress: string | null;
  listingSlug: string | null;
  decimals: number;
}

export const toDisplayAmount = (raw: bigint, decimals: number): string => {
  if (decimals === 0) {
    return raw.toString();
  }

  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
};

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

export interface ParsedPayment {
  reqId: string;
  payerAddress: string;
  amountRaw: bigint;
}

export const parsePayment = (header: string): ParsedPayment | null => {
  const claims = parsePaymentHeader(header).payload.claims as Record<
    string,
    unknown
  >;

  const reqId = claims.req_id ?? claims.reqId;
  const payer = claims.user_address ?? claims.userAddress;
  const amount = asBigInt(claims.amount);

  if (
    typeof reqId !== "string" ||
    typeof payer !== "string" ||
    amount === null
  ) {
    return null;
  }

  return { reqId, payerAddress: payer, amountRaw: amount };
};

export const reportPayment = async (
  config: ReportConfig,
  header: string,
  extra: { resource: string; description?: string },
): Promise<void> => {
  const parsed = parsePayment(header);
  if (!parsed) {
    console.warn(
      "[seller-live] could not read the payment header; not reported",
    );
    return;
  }

  try {
    const response = await fetch(`${config.baseUrl}/v1/payments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        reqId: parsed.reqId,
        payerAddress: parsed.payerAddress,
        recipientAddress: config.recipientAddress,
        network: config.network,
        assetAddress: config.assetAddress,
        amount: toDisplayAmount(parsed.amountRaw, config.decimals),
        status: "SETTLED",
        listingSlug: config.listingSlug,
        resource: extra.resource,
        description: extra.description ?? null,
      }),
    });

    if (!response.ok) {
      console.warn(
        `[seller-live] 4Mica rejected the report (${response.status}):`,
        await response.text(),
      );
      return;
    }

    console.log(`[seller-live] reported payment ${parsed.reqId}`);
  } catch (error) {
    console.warn("[seller-live] could not reach 4Mica to report:", error);
  }
};

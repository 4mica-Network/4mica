export type DeniedReason =
  | "customer_blocked"
  | "customer_suspended"
  | "identity_blocked"
  | "below_minimum";

export type CouponSkippedReason =
  | "unknown"
  | "revoked"
  | "expired"
  | "exhausted";

export interface PricingCoupon {
  code: string;
  kind: "PERCENT" | "FIXED";
  value: string;
  unusableReason: "revoked" | "expired" | "exhausted" | null;
}

export interface PricingInput {
  amount: string;
  status: "ACTIVE" | "BLOCKED" | "SUSPENDED";
  suspendedUntil: Date | null;
  identityBlocked: boolean;
  minPaymentAmount: string | null;
  freeQuotaUnit: "REQUESTS" | "AMOUNT" | null;
  quotaRemaining: string | null;
  coupon: PricingCoupon | null;
  couponRequested: string | null;
  discountPercent: string | null;
  discountFixed: string | null;
  creditBalance: string;
  approvalThreshold: string | null;
  now?: Date;
}

export interface PricingResult {
  allowed: boolean;
  deniedReason: DeniedReason | null;
  needsApproval: boolean;
  gross: string;
  quotaApplied: string;
  couponApplied: string;
  discountApplied: string;
  creditApplied: string;
  payable: string;
  couponSkippedReason: CouponSkippedReason | null;
}

const PLACES = 18;
const SCALE = 10n ** BigInt(PLACES);

export const parseAmount = (value: string): bigint => {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const digits = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ""] = digits.split(".");

  const scaled =
    BigInt(whole === "" ? "0" : whole) * SCALE +
    BigInt(fraction.slice(0, PLACES).padEnd(PLACES, "0") || "0");

  return negative ? -scaled : scaled;
};

export const formatAmount = (value: bigint): string => {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;

  const whole = magnitude / SCALE;
  const fraction = (magnitude % SCALE)
    .toString()
    .padStart(PLACES, "0")
    .replace(/0+$/, "");

  const text = fraction === "" ? `${whole}` : `${whole}.${fraction}`;

  return negative ? `-${text}` : text;
};

const percentOf = (value: bigint, percent: string): bigint =>
  (value * parseAmount(percent)) / (SCALE * 100n);

const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);
const atLeastZero = (value: bigint): bigint => (value < 0n ? 0n : value);

const denied = (reason: DeniedReason, gross: bigint): PricingResult => ({
  allowed: false,
  deniedReason: reason,
  needsApproval: false,
  gross: formatAmount(gross),
  quotaApplied: "0",
  couponApplied: "0",
  discountApplied: "0",
  creditApplied: "0",
  payable: formatAmount(gross),
  couponSkippedReason: null,
});

export const priceFor = (input: PricingInput): PricingResult => {
  const now = input.now ?? new Date();
  const gross = parseAmount(input.amount);

  if (input.status === "BLOCKED") {
    return denied("customer_blocked", gross);
  }

  if (
    input.status === "SUSPENDED" &&
    input.suspendedUntil !== null &&
    input.suspendedUntil > now
  ) {
    return denied("customer_suspended", gross);
  }

  if (input.identityBlocked) {
    return denied("identity_blocked", gross);
  }

  if (
    input.minPaymentAmount !== null &&
    gross < parseAmount(input.minPaymentAmount)
  ) {
    return denied("below_minimum", gross);
  }

  let remaining = gross;
  let quotaApplied = 0n;

  if (input.freeQuotaUnit && input.quotaRemaining !== null) {
    const left = parseAmount(input.quotaRemaining);

    if (input.freeQuotaUnit === "REQUESTS") {
      quotaApplied = left >= SCALE ? remaining : 0n;
    } else {
      quotaApplied = min(left, remaining);
    }

    remaining = atLeastZero(remaining - quotaApplied);
  }

  let couponApplied = 0n;
  let couponSkippedReason: CouponSkippedReason | null = null;

  if (input.couponRequested !== null) {
    if (!input.coupon) {
      couponSkippedReason = "unknown";
    } else if (input.coupon.unusableReason) {
      couponSkippedReason = input.coupon.unusableReason;
    } else {
      const off =
        input.coupon.kind === "PERCENT"
          ? percentOf(remaining, input.coupon.value)
          : parseAmount(input.coupon.value);

      couponApplied = min(off, remaining);
      remaining = atLeastZero(remaining - couponApplied);
    }
  }

  let discountApplied = 0n;

  if (input.discountPercent !== null) {
    const off = percentOf(remaining, input.discountPercent);
    discountApplied += off;
    remaining = atLeastZero(remaining - off);
  }

  if (input.discountFixed !== null) {
    const off = min(parseAmount(input.discountFixed), remaining);
    discountApplied += off;
    remaining = atLeastZero(remaining - off);
  }

  const credit = parseAmount(input.creditBalance);
  const creditApplied = credit > 0n ? min(credit, remaining) : 0n;

  remaining = atLeastZero(remaining - creditApplied);

  const needsApproval =
    input.approvalThreshold !== null &&
    gross > parseAmount(input.approvalThreshold);

  return {
    allowed: true,
    deniedReason: null,
    needsApproval,
    gross: formatAmount(gross),
    quotaApplied: formatAmount(quotaApplied),
    couponApplied: formatAmount(couponApplied),
    discountApplied: formatAmount(discountApplied),
    creditApplied: formatAmount(creditApplied),
    payable: formatAmount(remaining),
    couponSkippedReason,
  };
};

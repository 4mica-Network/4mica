import { describe, expect, it } from "vitest";
import { type PricingInput, priceFor } from "./customer-pricing";

const base: PricingInput = {
  amount: "1.00",
  status: "ACTIVE",
  suspendedUntil: null,
  identityBlocked: false,
  minPaymentAmount: null,
  freeQuotaUnit: null,
  quotaRemaining: null,
  coupon: null,
  couponRequested: null,
  discountPercent: null,
  discountFixed: null,
  creditBalance: "0",
  approvalThreshold: null,
};

const price = (over: Partial<PricingInput> = {}) =>
  priceFor({ ...base, ...over });

describe("refusals", () => {
  it("charges the full price when no rule applies", () => {
    const result = price();

    expect(result).toMatchObject({
      allowed: true,
      deniedReason: null,
      payable: "1",
      needsApproval: false,
    });
  });

  it("refuses a blocked customer", () => {
    expect(price({ status: "BLOCKED" })).toMatchObject({
      allowed: false,
      deniedReason: "customer_blocked",
    });
  });

  it("refuses a customer whose suspension has not lapsed", () => {
    const result = price({
      status: "SUSPENDED",
      suspendedUntil: new Date("2030-01-01T00:00:00.000Z"),
      now: new Date("2026-10-02T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      allowed: false,
      deniedReason: "customer_suspended",
    });
  });

  it("lets a lapsed suspension through without a write", () => {
    const result = price({
      status: "SUSPENDED",
      suspendedUntil: new Date("2026-01-01T00:00:00.000Z"),
      now: new Date("2026-10-02T00:00:00.000Z"),
    });

    expect(result.allowed).toBe(true);
    expect(result.payable).toBe("1");
  });

  it("refuses a blocked wallet even when the customer is active", () => {
    expect(price({ identityBlocked: true })).toMatchObject({
      allowed: false,
      deniedReason: "identity_blocked",
    });
  });

  it("puts the customer's own block ahead of a blocked wallet", () => {
    expect(
      price({ status: "BLOCKED", identityBlocked: true }).deniedReason,
    ).toBe("customer_blocked");
  });

  it("refuses an amount below the minimum", () => {
    expect(price({ amount: "0.001", minPaymentAmount: "0.01" })).toMatchObject({
      allowed: false,
      deniedReason: "below_minimum",
    });
  });

  it("accepts an amount exactly at the minimum", () => {
    expect(price({ amount: "0.01", minPaymentAmount: "0.01" }).allowed).toBe(
      true,
    );
  });

  it("reports the gross on a refusal so the caller can log it", () => {
    expect(price({ amount: "2.50", status: "BLOCKED" }).gross).toBe("2.5");
  });
});

describe("free allowance", () => {
  it("makes a whole call free while a request allowance remains", () => {
    const result = price({
      freeQuotaUnit: "REQUESTS",
      quotaRemaining: "5",
    });

    expect(result).toMatchObject({ quotaApplied: "1", payable: "0" });
  });

  it("charges in full once the request allowance is gone", () => {
    const result = price({
      freeQuotaUnit: "REQUESTS",
      quotaRemaining: "0",
    });

    expect(result).toMatchObject({ quotaApplied: "0", payable: "1" });
  });

  it("covers part of a call from an amount allowance", () => {
    const result = price({
      amount: "10",
      freeQuotaUnit: "AMOUNT",
      quotaRemaining: "4",
    });

    expect(result).toMatchObject({ quotaApplied: "4", payable: "6" });
  });

  it("covers a whole call when the amount allowance is larger", () => {
    const result = price({
      amount: "3",
      freeQuotaUnit: "AMOUNT",
      quotaRemaining: "10",
    });

    expect(result).toMatchObject({ quotaApplied: "3", payable: "0" });
  });
});

describe("coupons", () => {
  const coupon = (over: Record<string, unknown> = {}) => ({
    code: "WELCOME10",
    kind: "PERCENT" as const,
    value: "10",
    unusableReason: null,
    ...over,
  });

  it("takes a percentage off", () => {
    const result = price({
      amount: "10",
      couponRequested: "WELCOME10",
      coupon: coupon(),
    });

    expect(result).toMatchObject({ couponApplied: "1", payable: "9" });
  });

  it("takes a fixed amount off", () => {
    const result = price({
      amount: "10",
      couponRequested: "FIVE",
      coupon: coupon({ kind: "FIXED", value: "5" }),
    });

    expect(result).toMatchObject({ couponApplied: "5", payable: "5" });
  });

  it("never takes a fixed coupon below zero", () => {
    const result = price({
      amount: "3",
      couponRequested: "FIVE",
      coupon: coupon({ kind: "FIXED", value: "5" }),
    });

    expect(result).toMatchObject({ couponApplied: "3", payable: "0" });
  });

  it("ignores a coupon that was never issued and says so", () => {
    const result = price({ couponRequested: "NOPE", coupon: null });

    expect(result).toMatchObject({
      couponApplied: "0",
      payable: "1",
      couponSkippedReason: "unknown",
    });
  });

  for (const reason of ["revoked", "expired", "exhausted"] as const) {
    it(`ignores a ${reason} coupon and says so`, () => {
      const result = price({
        couponRequested: "WELCOME10",
        coupon: coupon({ unusableReason: reason }),
      });

      expect(result).toMatchObject({
        couponApplied: "0",
        payable: "1",
        couponSkippedReason: reason,
      });
    });
  }

  it("says nothing about coupons when none was asked for", () => {
    expect(price().couponSkippedReason).toBeNull();
  });

  it("applies a coupon to what is left after the allowance", () => {
    const result = price({
      amount: "10",
      freeQuotaUnit: "AMOUNT",
      quotaRemaining: "5",
      couponRequested: "WELCOME10",
      coupon: coupon({ kind: "PERCENT", value: "50" }),
    });

    // 50% of the remaining 5, not of the gross 10.
    expect(result).toMatchObject({
      quotaApplied: "5",
      couponApplied: "2.5",
      payable: "2.5",
    });
  });
});

describe("discounts and credit", () => {
  it("takes a percentage discount", () => {
    expect(price({ amount: "10", discountPercent: "10" })).toMatchObject({
      discountApplied: "1",
      payable: "9",
    });
  });

  it("takes a fixed discount", () => {
    expect(price({ amount: "10", discountFixed: "2.50" })).toMatchObject({
      discountApplied: "2.5",
      payable: "7.5",
    });
  });

  it("applies the percentage before the fixed discount", () => {
    const result = price({
      amount: "10",
      discountPercent: "50",
      discountFixed: "1",
    });

    // 50% off 10 leaves 5, then 1 off leaves 4.
    expect(result).toMatchObject({ discountApplied: "6", payable: "4" });
  });

  it("never discounts below zero", () => {
    expect(price({ amount: "1", discountFixed: "5" })).toMatchObject({
      discountApplied: "1",
      payable: "0",
    });
  });

  it("draws the rest from credit", () => {
    expect(price({ amount: "10", creditBalance: "4" })).toMatchObject({
      creditApplied: "4",
      payable: "6",
    });
  });

  it("uses only as much credit as the call needs", () => {
    expect(price({ amount: "2", creditBalance: "10" })).toMatchObject({
      creditApplied: "2",
      payable: "0",
    });
  });

  it("ignores a negative credit balance", () => {
    expect(price({ amount: "2", creditBalance: "-5" })).toMatchObject({
      creditApplied: "0",
      payable: "2",
    });
  });

  it("spends no credit on a call the allowance already covered", () => {
    const result = price({
      freeQuotaUnit: "REQUESTS",
      quotaRemaining: "5",
      creditBalance: "10",
    });

    expect(result).toMatchObject({
      quotaApplied: "1",
      creditApplied: "0",
      payable: "0",
    });
  });
});

describe("approval", () => {
  it("flags a call above the threshold but still allows it", () => {
    const result = price({ amount: "150", approvalThreshold: "100" });

    expect(result).toMatchObject({ allowed: true, needsApproval: true });
  });

  it("does not flag a call at the threshold", () => {
    expect(
      price({ amount: "100", approvalThreshold: "100" }).needsApproval,
    ).toBe(false);
  });

  it("measures approval on the gross, not what is left to pay", () => {
    const result = price({
      amount: "150",
      approvalThreshold: "100",
      creditBalance: "150",
    });

    expect(result).toMatchObject({ payable: "0", needsApproval: true });
  });

  it("never flags approval on a refusal", () => {
    expect(
      price({
        amount: "150",
        approvalThreshold: "100",
        status: "BLOCKED",
      }).needsApproval,
    ).toBe(false);
  });
});

describe("the whole chain", () => {
  it("applies allowance, coupon, discounts and credit in order", () => {
    const result = price({
      amount: "100",
      freeQuotaUnit: "AMOUNT",
      quotaRemaining: "20",
      couponRequested: "WELCOME10",
      coupon: {
        code: "WELCOME10",
        kind: "PERCENT",
        value: "10",
        unusableReason: null,
      },
      discountPercent: "50",
      discountFixed: "6",
      creditBalance: "10",
      approvalThreshold: "50",
    });

    // 100 − 20 allowance = 80; −10% = 72; −50% = 36; −6 = 30; −10 credit = 20.
    expect(result).toEqual({
      allowed: true,
      deniedReason: null,
      needsApproval: true,
      gross: "100",
      quotaApplied: "20",
      couponApplied: "8",
      discountApplied: "42",
      creditApplied: "10",
      payable: "20",
      couponSkippedReason: null,
    });
  });

  it("keeps decimal precision rather than drifting through floats", () => {
    const result = price({ amount: "0.07", discountPercent: "33.33" });

    expect(result.payable).toBe("0.046669");
  });
});

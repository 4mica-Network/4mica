import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, usageLimitRef } = vi.hoisted(() => ({
  usageLimitRef: { name: "usageLimit", modelName: "CustomerCoupon" },
  tx: {
    payment: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    customerPaymentIdentity: { findFirst: vi.fn() },
    customerCoupon: { updateMany: vi.fn() },
    customerCreditEntry: { aggregate: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@4mica/db", async () => {
  const { Decimal } = await import("@prisma/client/runtime/client");

  return {
    Prisma: { Decimal },
    prisma: {
      $transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
      customerCoupon: { fields: { usageLimit: usageLimitRef } },
    },
  };
});

const { Prisma, prisma } = await import("@4mica/db");
const { redeemPaymentBenefits } = await import("./repository");

const OWNER = "owner-1";
const PAYMENT = "payment-1";
const NOW = new Date("2026-10-08T12:00:00.000Z");

const settled = (over: Record<string, unknown> = {}) => ({
  reqId: "0xabc",
  payerAddress: "0x8a1c3f5b7d092e4a6c8b0d2f4e6a8c1b3d5f7e90",
  network: "BASE_SEPOLIA",
  couponCode: "WELCOME10",
  creditApplied: new Prisma.Decimal("4"),
  createdAt: new Date("2026-10-08T11:59:00.000Z"),
  ...over,
});

const customerFound = () =>
  tx.customerPaymentIdentity.findFirst.mockResolvedValue({
    blockedAt: null,
    customer: { id: "customer-1" },
  });

const balance = (value: string) =>
  tx.customerCreditEntry.aggregate.mockResolvedValue({
    _sum: { amount: new Prisma.Decimal(value) },
  });

describe("redeemPaymentBenefits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.payment.findUniqueOrThrow.mockResolvedValue(settled());
    tx.customerCoupon.updateMany.mockResolvedValue({ count: 1 });
    customerFound();
    balance("10");
  });

  it("runs in one serializable transaction", async () => {
    await redeemPaymentBenefits(OWNER, PAYMENT, NOW);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("claims the payment once, so a replayed report redeems nothing", async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 0 });

    expect(await redeemPaymentBenefits(OWNER, PAYMENT, NOW)).toBeNull();
    expect(tx.payment.updateMany.mock.calls[0][0]).toMatchObject({
      where: {
        id: PAYMENT,
        ownerId: OWNER,
        status: "SETTLED",
        redeemedAt: null,
      },
      data: { redeemedAt: NOW },
    });
    expect(tx.customerCoupon.updateMany).not.toHaveBeenCalled();
    expect(tx.customerCreditEntry.create).not.toHaveBeenCalled();
  });

  it("counts a coupon use only while it is under its usage limit", async () => {
    const result = await redeemPaymentBenefits(OWNER, PAYMENT, NOW);

    const call = tx.customerCoupon.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      ownerId: OWNER,
      customerId: "customer-1",
      code: "WELCOME10",
      revokedAt: null,
    });
    expect(JSON.stringify(call.where.AND)).toContain('"usageLimit":null');
    expect(call.where.AND[1].OR[1]).toEqual({
      timesRedeemed: { lt: usageLimitRef },
    });
    expect(call.data).toEqual({ timesRedeemed: { increment: 1 } });
    expect(result?.couponRedeemed).toBe(true);
  });

  it("reports an exhausted coupon without failing the redemption", async () => {
    tx.customerCoupon.updateMany.mockResolvedValue({ count: 0 });

    const result = await redeemPaymentBenefits(OWNER, PAYMENT, NOW);

    expect(result?.couponRedeemed).toBe(false);
    expect(result?.creditDrawn).toBe("4");
  });

  it("draws the applied credit down as an offsetting entry", async () => {
    await redeemPaymentBenefits(OWNER, PAYMENT, NOW);

    const data = tx.customerCreditEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      ownerId: OWNER,
      customerId: "customer-1",
      kind: "ADJUSTMENT",
      reason: "payment 0xabc",
    });
    expect(data.amount.toFixed()).toBe("-4");
  });

  it("never draws the balance below zero", async () => {
    balance("1.5");

    const result = await redeemPaymentBenefits(OWNER, PAYMENT, NOW);

    expect(
      tx.customerCreditEntry.create.mock.calls[0][0].data.amount.toFixed(),
    ).toBe("-1.5");
    expect(result?.creditDrawn).toBe("1.5");
  });

  it("writes no credit entry on an empty balance", async () => {
    balance("0");

    await redeemPaymentBenefits(OWNER, PAYMENT, NOW);

    expect(tx.customerCreditEntry.create).not.toHaveBeenCalled();
  });

  it("matches the customer as of when the payment was made", async () => {
    await redeemPaymentBenefits(OWNER, PAYMENT, NOW);

    const where = tx.customerPaymentIdentity.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      ownerId: OWNER,
      type: "WALLET",
      network: "BASE_SEPOLIA",
    });
    expect(JSON.stringify(where.AND)).toContain("2026-10-08T11:59:00.000Z");
  });

  it("changes nothing for a payer who is not a customer", async () => {
    tx.customerPaymentIdentity.findFirst.mockResolvedValue(null);

    const result = await redeemPaymentBenefits(OWNER, PAYMENT, NOW);

    expect(result).toMatchObject({ customerId: null, couponRedeemed: false });
    expect(tx.customerCoupon.updateMany).not.toHaveBeenCalled();
    expect(tx.customerCreditEntry.create).not.toHaveBeenCalled();
  });
});

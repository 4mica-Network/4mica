import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    payment: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

vi.mock("@4mica/db", () => ({
  prisma: db,
  Prisma: { sql: vi.fn(), join: vi.fn() },
  disconnect: vi.fn(),
}));

const { runReconciliation } = await import("./processor");

const NOW = new Date("2026-12-02T12:00:00Z");
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const payment = (id: string) => ({
  id,
  reqId: `0x${id}`,
  network: "BASE_SEPOLIA",
  assetAddress: null,
  payerAddress: "0x1111111111111111111111111111111111111111",
  recipientAddress: "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5",
  amount: { toFixed: () => "1" },
  status: "SETTLED",
});

describe("payment reconciliation sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.payment.findMany.mockResolvedValue([payment("a"), payment("b")]);
    db.payment.groupBy.mockResolvedValue([]);
  });

  it("retries only pending payments that are due, oldest first", async () => {
    await runReconciliation({
      logger,
      now: () => NOW,
      reconcile: vi.fn(async () => "reconciled" as const),
    });

    expect(db.payment.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { reconciliationState: "PENDING", reconcileAfter: { lte: NOW } },
      orderBy: [{ reconcileAfter: "asc" }, { id: "asc" }],
      take: 200,
    });
  });

  it("counts each outcome and keeps going past a failure", async () => {
    const reconcile = vi
      .fn()
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("unresolved");

    const summary = await runReconciliation({
      logger,
      now: () => NOW,
      reconcile,
    });

    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(reconcile.mock.calls[0]?.[0]).toMatchObject({
      id: "a",
      amount: "1",
    });
    expect(summary).toMatchObject({ failed: 1, unresolved: 1, reconciled: 0 });
    expect(logger.error).toHaveBeenCalledWith(
      "reconciliation: payment unresolved",
      { paymentId: "b" },
    );
  });

  it("logs the backlog as a metric and warns while anything is unresolved", async () => {
    db.payment.groupBy.mockResolvedValue([
      {
        reconciliationState: "PENDING",
        _count: { _all: 3 },
        _min: { createdAt: new Date(NOW.getTime() - 90_000) },
      },
      {
        reconciliationState: "UNRESOLVED",
        _count: { _all: 1 },
        _min: { createdAt: new Date(NOW.getTime() - 7_200_000) },
      },
    ]);

    const summary = await runReconciliation({
      logger,
      now: () => NOW,
      reconcile: vi.fn(async () => "skipped" as const),
    });

    expect(summary.backlog).toEqual({
      pending: 3,
      unresolved: 1,
      oldestPendingSeconds: 90,
      oldestUnresolvedSeconds: 7200,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "reconciliation: backlog",
      expect.objectContaining({
        metric: "payment_reconciliation_backlog",
        skipped: 2,
        pending: 3,
        unresolved: 1,
      }),
    );
  });

  it("stops between payments when asked", async () => {
    const reconcile = vi.fn(async () => "reconciled" as const);

    await runReconciliation({
      logger,
      now: () => NOW,
      shouldStop: () => reconcile.mock.calls.length > 0,
      reconcile,
    });

    expect(reconcile).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { runRetention } from "./processor";

const { db, tx } = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    auditLog: { deleteMany: vi.fn(), create: vi.fn() },
  };
  return {
    tx,
    db: {
      governanceSettings: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@4mica/db", () => ({ prisma: db, disconnect: vi.fn() }));

const ORG_A = "019fce62-0000-7000-8000-0000000000a1";
const ORG_B = "019fce62-0000-7000-8000-0000000000b2";
const NOW = new Date("2026-11-27T03:15:00Z");

const logger = { info: vi.fn(), error: vi.fn() };

const run = () => runRetention({ logger, now: () => NOW });

describe("audit retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(
      async (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    tx.$executeRaw.mockResolvedValue(0);
    tx.auditLog.create.mockResolvedValue({ id: "audit" });
    db.governanceSettings.findMany.mockResolvedValue([
      { organizationId: ORG_A, auditRetentionDays: 30 },
    ]);
    tx.auditLog.deleteMany.mockResolvedValue({ count: 4 });
  });

  it("only reads organizations that set a retention period", async () => {
    await run();

    expect(db.governanceSettings.findMany.mock.calls[0][0].where).toEqual({
      auditRetentionDays: { not: null },
      organization: { deletedAt: null },
    });
  });

  it("enables the retention bypass inside the purge transaction before deleting", async () => {
    await run();

    const [strings] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join("")).toBe("SET LOCAL fourmica.audit_retention = 'on'");
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.auditLog.deleteMany.mock.invocationCallOrder[0] as number,
    );
  });

  it("deletes only that organization's rows older than the period", async () => {
    await run();

    expect(tx.auditLog.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_A,
        createdAt: { lt: new Date("2026-10-28T03:15:00Z") },
      },
    });
  });

  it("records the purge in the same transaction", async () => {
    const summary = await run();

    expect(summary).toEqual({ organizations: 1, purged: 4, failed: 0 });
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      organizationId: ORG_A,
      action: "audit.retention_purged",
      targetType: "organization",
      targetId: ORG_A,
      metadata: {
        count: 4,
        retentionDays: 30,
        before: "2026-10-28T03:15:00.000Z",
      },
    });
  });

  it("records nothing when there was nothing to purge", async () => {
    tx.auditLog.deleteMany.mockResolvedValue({ count: 0 });

    await run();

    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("keeps going past an organization that fails", async () => {
    db.governanceSettings.findMany.mockResolvedValue([
      { organizationId: ORG_A, auditRetentionDays: 30 },
      { organizationId: ORG_B, auditRetentionDays: 90 },
    ]);
    tx.auditLog.deleteMany
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ count: 2 });

    const summary = await run();

    expect(summary).toEqual({ organizations: 2, purged: 2, failed: 1 });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("stops between organizations when shutting down", async () => {
    db.governanceSettings.findMany.mockResolvedValue([
      { organizationId: ORG_A, auditRetentionDays: 30 },
      { organizationId: ORG_B, auditRetentionDays: 90 },
    ]);
    let calls = 0;

    const summary = await runRetention({
      logger,
      now: () => NOW,
      shouldStop: () => calls++ > 0,
    });

    expect(summary.organizations).toBe(1);
    expect(tx.auditLog.deleteMany).toHaveBeenCalledOnce();
  });
});

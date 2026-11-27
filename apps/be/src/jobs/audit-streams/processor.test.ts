import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASE_BACKOFF_MS,
  backoffMs,
  MAX_BACKOFF_MS,
  runAuditStreams,
} from "./processor";

const { db } = vi.hoisted(() => {
  const db = {
    auditStream: { findMany: vi.fn(), updateMany: vi.fn() },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { db };
});

vi.mock("@4mica/db", () => ({ prisma: db, disconnect: vi.fn() }));

const ORG_ID = "019fce62-0000-7000-8000-0000000000a1";
const STREAM_ID = "019fce62-0000-7000-8000-0000000000aa";
const NOW = new Date("2026-11-27T12:00:00Z");
const KEY = "k".repeat(32);

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const send = vi.fn();

const stream = (over: Record<string, unknown> = {}) => ({
  id: STREAM_ID,
  organizationId: ORG_ID,
  url: "https://siem.example.com/ingest",
  secretVersion: 1,
  actionPrefixes: [],
  cursorId: "019fce62-0000-7000-8000-000000000e00",
  consecutiveFailures: 0,
  ...over,
});

const row = (n: number) => ({
  id: `019fce62-0000-7000-8000-000000000e${String(n).padStart(2, "0")}`,
  organizationId: ORG_ID,
  projectId: null,
  actorUserId: null,
  actorApiKeyId: null,
  action: "member.joined",
  targetType: "user",
  targetId: "u1",
  metadata: null,
  ip: null,
  createdAt: NOW,
});

const run = () =>
  runAuditStreams({ logger, signingKey: KEY, now: () => NOW, send });

describe("audit stream delivery job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) =>
      fn(db),
    );
    db.auditStream.findMany.mockResolvedValue([stream()]);
    db.auditStream.updateMany.mockResolvedValue({ count: 1 });
    db.auditLog.findMany.mockResolvedValueOnce([row(1), row(2)]);
    db.auditLog.findMany.mockResolvedValue([]);
    db.auditLog.create.mockResolvedValue({ id: "audit" });
    send.mockResolvedValue({
      ok: true,
      statusCode: 200,
      error: null,
      deliveryId: "d",
    });
  });

  it("does nothing without a signing key", async () => {
    expect(
      await runAuditStreams({ logger, signingKey: undefined, send }),
    ).toEqual({
      streams: 0,
      delivered: 0,
      failed: 0,
    });
    expect(db.auditStream.findMany).not.toHaveBeenCalled();
  });

  it("only picks live, due, active or failing streams", async () => {
    await run();

    expect(db.auditStream.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      status: { in: ["ACTIVE", "FAILING"] },
      organization: { deletedAt: null },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: NOW } }],
    });
  });

  it("reads the org's rows after the cursor and advances it on 2xx", async () => {
    const summary = await run();

    expect(db.auditLog.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        organizationId: ORG_ID,
        id: { gt: "019fce62-0000-7000-8000-000000000e00" },
      },
      orderBy: { id: "asc" },
      take: 500,
    });
    expect(send.mock.calls[0][0]).toMatchObject({ id: STREAM_ID });
    expect(send.mock.calls[0][2]).toHaveLength(2);
    expect(db.auditStream.updateMany.mock.calls[0][0]).toEqual({
      where: { id: STREAM_ID, deletedAt: null },
      data: {
        cursorId: row(2).id,
        status: "ACTIVE",
        consecutiveFailures: 0,
        lastDeliveryAt: NOW,
        lastStatusCode: 200,
        lastError: null,
        nextAttemptAt: null,
      },
    });
    expect(summary).toEqual({ streams: 1, delivered: 2, failed: 0 });
  });

  it("filters by action prefix", async () => {
    db.auditStream.findMany.mockResolvedValue([
      stream({ actionPrefixes: ["member.", "role."] }),
    ]);

    await run();

    expect(db.auditLog.findMany.mock.calls[0][0].where.OR).toEqual([
      { action: { startsWith: "member." } },
      { action: { startsWith: "role." } },
    ]);
  });

  it("sends nothing when there is nothing new", async () => {
    db.auditLog.findMany.mockReset();
    db.auditLog.findMany.mockResolvedValue([]);

    await run();

    expect(send).not.toHaveBeenCalled();
    expect(db.auditStream.updateMany).not.toHaveBeenCalled();
  });

  it("keeps the cursor and backs off on a failure", async () => {
    send.mockResolvedValue({
      ok: false,
      statusCode: 503,
      error: "The endpoint answered 503.",
      deliveryId: "d",
    });
    db.auditStream.findMany.mockResolvedValue([
      stream({ consecutiveFailures: 2 }),
    ]);

    const summary = await run();

    const { data } = db.auditStream.updateMany.mock.calls[0][0];
    expect(data).not.toHaveProperty("cursorId");
    expect(data).toEqual({
      status: "FAILING",
      consecutiveFailures: 3,
      lastStatusCode: 503,
      lastError: "The endpoint answered 503.",
      nextAttemptAt: new Date(NOW.getTime() + 4 * BASE_BACKOFF_MS),
    });
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(summary.failed).toBe(1);
  });

  it("pauses after 20 consecutive failures and records it", async () => {
    send.mockResolvedValue({
      ok: false,
      statusCode: null,
      error: "unreachable",
      deliveryId: "d",
    });
    db.auditStream.findMany.mockResolvedValue([
      stream({ consecutiveFailures: 19 }),
    ]);

    await run();

    expect(db.auditStream.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "PAUSED",
      consecutiveFailures: 20,
      nextAttemptAt: null,
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      organizationId: ORG_ID,
      action: "audit_stream.paused",
      targetId: STREAM_ID,
    });
  });

  it("doubles the backoff from 30s up to an hour", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(5)).toBe(480_000);
    expect(backoffMs(19)).toBe(MAX_BACKOFF_MS);
  });

  it("drains full batches until one comes back short", async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({
      ...row(1),
      id: `019fce62-0000-7000-8000-${String(i).padStart(12, "0")}`,
    }));
    db.auditLog.findMany.mockReset();
    db.auditLog.findMany
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([row(99)])
      .mockResolvedValue([]);

    const summary = await run();

    expect(send).toHaveBeenCalledTimes(2);
    expect(db.auditLog.findMany.mock.calls[1][0].where.id).toEqual({
      gt: full[499]?.id,
    });
    expect(summary.delivered).toBe(501);
  });

  it("keeps going past a stream that throws", async () => {
    db.auditStream.findMany.mockResolvedValue([
      stream(),
      stream({ id: "019fce62-0000-7000-8000-0000000000bb" }),
    ]);
    db.auditLog.findMany.mockReset();
    db.auditLog.findMany
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([row(1)])
      .mockResolvedValue([]);

    const summary = await run();

    expect(summary).toEqual({ streams: 2, delivered: 1, failed: 1 });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

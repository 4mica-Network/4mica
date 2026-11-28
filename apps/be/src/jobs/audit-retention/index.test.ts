import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  QueueMock,
  WorkerMock,
  upsertJobScheduler,
  queueClose,
  workerClose,
  on,
} = vi.hoisted(() => {
  const upsertJobScheduler = vi.fn(async () => {});
  const queueClose = vi.fn(async () => {});
  const workerClose = vi.fn(async () => {});
  const on = vi.fn();

  return {
    upsertJobScheduler,
    queueClose,
    workerClose,
    on,
    QueueMock: vi.fn(function Queue() {
      return { upsertJobScheduler, close: queueClose };
    }),
    WorkerMock: vi.fn(function Worker() {
      return { on, close: workerClose };
    }),
  };
});

vi.mock("bullmq", () => ({ Queue: QueueMock, Worker: WorkerMock }));

vi.mock("@4mica/db", () => ({
  prisma: {},
  disconnect: vi.fn(async () => {}),
}));

const importSubject = async () => {
  vi.resetModules();
  return import("./index");
};

describe("startAuditRetention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VALKEY_URL", "redis://127.0.0.1:6379");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("starts nothing when VALKEY_URL is unset", async () => {
    vi.stubEnv("VALKEY_URL", "");
    const { startAuditRetention } = await importSubject();

    expect(await startAuditRetention()).toBe(false);
    expect(QueueMock).not.toHaveBeenCalled();
    expect(WorkerMock).not.toHaveBeenCalled();
  });

  it("schedules one run a day in UTC", async () => {
    const { startAuditRetention } = await importSubject();

    expect(await startAuditRetention()).toBe(true);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "audit-retention-daily",
      { pattern: "15 3 * * *", tz: "UTC" },
      { name: "purge" },
    );
    expect(on.mock.calls.map(([event]) => event)).toContain("error");
  });

  it("closes the worker before the queue on shutdown", async () => {
    const { startAuditRetention, stopAuditRetention } = await importSubject();
    await startAuditRetention();

    await stopAuditRetention();

    expect(workerClose.mock.invocationCallOrder[0]).toBeLessThan(
      queueClose.mock.invocationCallOrder[0] as number,
    );
  });

  it("is safe to stop when it never started", async () => {
    const { stopAuditRetention } = await importSubject();

    await expect(stopAuditRetention()).resolves.toBeUndefined();
  });
});

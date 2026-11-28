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

vi.mock("@services/email", () => ({ getEmailClient: () => null }));

const importSubject = async () => {
  vi.resetModules();
  return import("./index");
};

describe("startReconciliation", () => {
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
    const { startReconciliation } = await importSubject();

    expect(await startReconciliation()).toBe(false);
    expect(QueueMock).not.toHaveBeenCalled();
    expect(WorkerMock).not.toHaveBeenCalled();
  });

  it("sweeps for due reconciliations every minute", async () => {
    const { startReconciliation } = await importSubject();

    expect(await startReconciliation()).toBe(true);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "payment-reconciliation-sweep",
      { every: 60_000 },
      { name: "sweep" },
    );
    expect(on.mock.calls.map(([event]) => event)).toContain("error");
  });

  it("closes the worker before the queue on shutdown", async () => {
    const { startReconciliation, stopReconciliation } = await importSubject();
    await startReconciliation();

    await stopReconciliation();

    expect(workerClose.mock.invocationCallOrder[0]).toBeLessThan(
      queueClose.mock.invocationCallOrder[0] as number,
    );
  });

  it("is safe to stop when it never started", async () => {
    const { stopReconciliation } = await importSubject();

    await expect(stopReconciliation()).resolves.toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { QueueMock, WorkerMock, upsertJobScheduler, queueClose, workerClose } =
  vi.hoisted(() => {
    const upsertJobScheduler = vi.fn(async () => {});
    const queueClose = vi.fn(async () => {});
    const workerClose = vi.fn(async () => {});
    return {
      upsertJobScheduler,
      queueClose,
      workerClose,
      QueueMock: vi.fn(function Queue() {
        return { upsertJobScheduler, close: queueClose };
      }),
      WorkerMock: vi.fn(function Worker() {
        return { on: vi.fn(), close: workerClose };
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

describe("startAuditStreams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VALKEY_URL", "redis://127.0.0.1:6379");
    vi.stubEnv("AUDIT_STREAM_SIGNING_KEY", "s".repeat(32));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("starts nothing without Valkey", async () => {
    vi.stubEnv("VALKEY_URL", "");
    const { startAuditStreams } = await importSubject();

    expect(await startAuditStreams()).toBe(false);
    expect(QueueMock).not.toHaveBeenCalled();
  });

  it("starts nothing without a signing key", async () => {
    vi.stubEnv("AUDIT_STREAM_SIGNING_KEY", "");
    const { startAuditStreams } = await importSubject();

    expect(await startAuditStreams()).toBe(false);
    expect(WorkerMock).not.toHaveBeenCalled();
  });

  it("runs every 30 seconds and closes the worker before the queue", async () => {
    const { startAuditStreams, stopAuditStreams } = await importSubject();

    expect(await startAuditStreams()).toBe(true);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "audit-streams-every-30s",
      { every: 30_000 },
      { name: "deliver" },
    );

    await stopAuditStreams();
    expect(workerClose.mock.invocationCallOrder[0]).toBeLessThan(
      queueClose.mock.invocationCallOrder[0] as number,
    );
  });
});

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

const VALKEY = "redis://127.0.0.1:6379";
const SECRET = "b".repeat(48);

const importSubject = async () => {
  vi.resetModules();

  return import("./index");
};

const fakeApp = (email: unknown = { sendOnboardingStep: vi.fn() }) => ({
  email,
  addHook: vi.fn(),
});

describe("startOnboardingDrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VALKEY_URL", VALKEY);
    vi.stubEnv("UNSUBSCRIBE_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("starts nothing when VALKEY_URL is unset", async () => {
    vi.stubEnv("VALKEY_URL", "");
    const { startOnboardingDrip } = await importSubject();

    expect(await startOnboardingDrip(fakeApp() as never)).toBe(false);
    expect(QueueMock).not.toHaveBeenCalled();
    expect(WorkerMock).not.toHaveBeenCalled();
  });

  it("refuses to start without an unsubscribe secret", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    const { startOnboardingDrip } = await importSubject();

    expect(await startOnboardingDrip(fakeApp() as never)).toBe(false);
    expect(WorkerMock).not.toHaveBeenCalled();
  });

  it("starts nothing when there is no email service", async () => {
    const { startOnboardingDrip } = await importSubject();

    expect(await startOnboardingDrip(fakeApp(null) as never)).toBe(false);
    expect(WorkerMock).not.toHaveBeenCalled();
  });

  it("registers the repeatable tick and a shutdown hook when configured", async () => {
    const { startOnboardingDrip } = await importSubject();
    const app = fakeApp();

    expect(await startOnboardingDrip(app as never)).toBe(true);
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(app.addHook).toHaveBeenCalledWith("onClose", expect.any(Function));
  });

  it("handles worker connection errors", async () => {
    const { startOnboardingDrip } = await importSubject();
    await startOnboardingDrip(fakeApp() as never);

    expect(on.mock.calls.map(([event]) => event)).toContain("error");
  });

  it("closes the worker before the queue on shutdown", async () => {
    const { startOnboardingDrip, stopOnboardingDrip } = await importSubject();
    await startOnboardingDrip(fakeApp() as never);

    await stopOnboardingDrip();

    expect(workerClose).toHaveBeenCalled();
    expect(queueClose).toHaveBeenCalled();
    expect(workerClose.mock.invocationCallOrder[0]).toBeLessThan(
      queueClose.mock.invocationCallOrder[0] as number,
    );
  });

  it("is safe to stop when it never started", async () => {
    const { stopOnboardingDrip } = await importSubject();

    await expect(stopOnboardingDrip()).resolves.toBeUndefined();
  });
});

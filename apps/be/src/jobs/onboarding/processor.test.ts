import { beforeEach, describe, expect, it, vi } from "vitest";
import { runTick } from "./processor";
import { MAX_ATTEMPTS, ONBOARDING_STEPS, STEP_COUNT } from "./steps";

const {
  userFindMany,
  userUpdate,
  queueCreateMany,
  queueFindMany,
  queueUpdateMany,
  queueUpdate,
  sendCreate,
  transaction,
} = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userUpdate: vi.fn(),
  queueCreateMany: vi.fn(),
  queueFindMany: vi.fn(),
  queueUpdateMany: vi.fn(),
  queueUpdate: vi.fn(),
  sendCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    user: { findMany: userFindMany, update: userUpdate },
    onboardingEmailQueue: {
      createMany: queueCreateMany,
      findMany: queueFindMany,
      updateMany: queueUpdateMany,
      update: queueUpdate,
    },
    onboardingEmailSend: { create: sendCreate },
    $transaction: transaction,
  },
  disconnect: vi.fn(async () => {}),
}));

const NOW = new Date("2026-10-01T12:00:00.000Z");
const now = () => NOW;

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "queue-1",
  userId: "user-1",
  sequenceIndex: 0,
  step: ONBOARDING_STEPS[0].id,
  attempts: 0,
  user: { id: "user-1", email: "ada@4mica.io", name: "Ada" },
  ...overrides,
});

const queueWrite = () =>
  (queueUpdate.mock.calls.at(-1)?.[0] ?? {}) as {
    where: { id: string };
    data: Record<string, unknown>;
  };

const sendWrite = () =>
  (sendCreate.mock.calls.at(-1)?.[0]?.data ?? {}) as Record<string, unknown>;

const emailStub = (result: unknown = { id: "msg_1" }) => ({
  sendOnboardingStep: vi.fn().mockResolvedValue(result),
});

beforeEach(() => {
  vi.clearAllMocks();
  userFindMany.mockResolvedValue([]);
  queueCreateMany.mockResolvedValue({ count: 0 });
  queueUpdateMany.mockResolvedValue({ count: 0 });
  queueFindMany.mockResolvedValue([]);
  transaction.mockResolvedValue([]);
});

const claim = (claimed: ReturnType<typeof row>) => {
  queueFindMany
    .mockResolvedValueOnce([{ id: claimed.id }])
    .mockResolvedValueOnce([claimed]);
  queueUpdateMany
    .mockResolvedValueOnce({ count: 0 })
    .mockResolvedValueOnce({ count: 1 });
};

describe("runTick", () => {
  it("does nothing when no email service is configured", async () => {
    const summary = await runTick({ email: null, logger, now });

    expect(summary.claimed).toBe(0);
    expect(queueFindMany).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("enrols eligible users from the drip epoch onward", async () => {
    const createdAt = new Date("2026-09-20T00:00:00.000Z");
    userFindMany.mockResolvedValue([{ id: "user-9", createdAt }]);
    queueCreateMany.mockResolvedValue({ count: 1 });

    const summary = await runTick({ email: emailStub() as never, logger, now });

    expect(summary.enrolled).toBe(1);
    expect(queueCreateMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "user-9",
          step: ONBOARDING_STEPS[0].id,
          sequenceIndex: 0,
          nextAttemptAt: new Date(
            createdAt.getTime() + ONBOARDING_STEPS[0].gapMs,
          ),
        },
      ],
      skipDuplicates: true,
    });
  });

  it("only enrols users who can be mailed", async () => {
    await runTick({ email: emailStub() as never, logger, now });

    const where = userFindMany.mock.calls[0]?.[0]?.where;

    expect(where).toMatchObject({
      email: { not: null },
      banned: false,
      locked: false,
      deletedAt: null,
      allowMarketingOnboardingEmails: true,
      onboardingQueue: { is: null },
    });
  });

  it("returns locks abandoned by a crashed worker", async () => {
    queueUpdateMany.mockResolvedValueOnce({ count: 3 });

    const summary = await runTick({ email: emailStub() as never, logger, now });

    expect(summary.reaped).toBe(3);
    expect(queueUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: "SENDING", lockedUntil: { lt: NOW } },
      data: { status: "PENDING", lockId: null, lockedUntil: null },
    });
  });

  it("sends the due step with a stable idempotency key", async () => {
    claim(row());
    const email = emailStub();

    const summary = await runTick({ email: email as never, logger, now });

    expect(summary.sent).toBe(1);
    expect(email.sendOnboardingStep).toHaveBeenCalledWith(
      "welcome",
      expect.objectContaining({
        to: "ada@4mica.io",
        userName: "Ada",
        idempotencyKey: "onboarding:user-1:welcome",
      }),
    );
  });

  it("advances the cursor and schedules the next step one gap out", async () => {
    claim(row());

    await runTick({ email: emailStub() as never, logger, now });

    expect(queueWrite().data).toMatchObject({
      sequenceIndex: 1,
      step: ONBOARDING_STEPS[1].id,
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(NOW.getTime() + ONBOARDING_STEPS[1].gapMs),
      lockId: null,
      lockedUntil: null,
    });
  });

  it("completes the sequence on the final step", async () => {
    const last = STEP_COUNT - 1;
    claim(row({ sequenceIndex: last, step: ONBOARDING_STEPS[last].id }));

    const summary = await runTick({ email: emailStub() as never, logger, now });

    expect(summary.completed).toBe(1);
    expect(queueWrite().data).toMatchObject({
      status: "COMPLETED",
      completedAt: NOW,
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { completeOnboarding: true },
    });
  });

  it("retries with backoff when the email service rejects the send", async () => {
    claim(row());

    const summary = await runTick({
      email: emailStub(null) as never,
      logger,
      now,
    });

    expect(summary.failed).toBe(1);
    expect(queueWrite().data).toMatchObject({ attempts: 1, status: "PENDING" });
    expect(sendWrite().succeeded).toBe(false);
  });

  it("retries when the send throws", async () => {
    claim(row());
    const email = {
      sendOnboardingStep: vi.fn().mockRejectedValue(new Error("boom")),
    };

    const summary = await runTick({ email: email as never, logger, now });

    expect(summary.failed).toBe(1);
    expect(sendWrite().error).toContain("boom");
  });

  it("abandons a step once the attempt budget is spent", async () => {
    claim(row({ attempts: MAX_ATTEMPTS - 1 }));

    await runTick({ email: emailStub(null) as never, logger, now });

    expect(queueWrite().data).toMatchObject({
      sequenceIndex: 1,
      step: ONBOARDING_STEPS[1].id,
      attempts: 0,
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it("repairs a row whose step disagrees with its index", async () => {
    claim(row({ sequenceIndex: 2, step: "onboarding-something-stale" }));
    const email = emailStub();

    const summary = await runTick({ email: email as never, logger, now });

    expect(summary.skipped).toBe(1);
    expect(email.sendOnboardingStep).not.toHaveBeenCalled();
    expect(queueUpdate).toHaveBeenCalledWith({
      where: { id: "queue-1" },
      data: expect.objectContaining({ step: ONBOARDING_STEPS[2].id }),
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it("skips a row that lost its email address between claim and send", async () => {
    claim(row({ user: { id: "user-1", email: null, name: "Ada" } }));
    const email = emailStub();

    const summary = await runTick({ email: email as never, logger, now });

    expect(summary.skipped).toBe(1);
    expect(email.sendOnboardingStep).not.toHaveBeenCalled();
  });

  it("lets an empty name fall through to the schema default", async () => {
    claim(row({ user: { id: "user-1", email: "ada@4mica.io", name: "" } }));
    const email = emailStub();

    await runTick({ email: email as never, logger, now });

    expect(
      email.sendOnboardingStep.mock.calls[0]?.[1].userName,
    ).toBeUndefined();
  });

  it("stops mid-batch when asked to shut down", async () => {
    queueFindMany
      .mockResolvedValueOnce([{ id: "queue-1" }, { id: "queue-2" }])
      .mockResolvedValueOnce([row(), row({ id: "queue-2" })]);
    queueUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 2 });
    const email = emailStub();

    const summary = await runTick({
      email: email as never,
      logger,
      now,
      shouldStop: () => true,
    });

    expect(email.sendOnboardingStep).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(2);
  });

  it("claims nothing when nothing is due", async () => {
    const email = emailStub();

    const summary = await runTick({ email: email as never, logger, now });

    expect(summary.claimed).toBe(0);
    expect(email.sendOnboardingStep).not.toHaveBeenCalled();
  });
});

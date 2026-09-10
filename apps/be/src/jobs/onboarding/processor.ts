import { randomUUID } from "node:crypto";
import type { EmailClient, OnboardingStepId } from "@4mica/email-client";
import { config } from "@config/index";
import { unsubscribeUrlFor } from "@services/unsubscribe-token";
import {
  type ClaimedRow,
  claimDueRows,
  enrolNewUsers,
  recordFailure,
  recordSuccess,
  releaseExpiredLocks,
  releaseRow,
  repairStep,
  type SendRecord,
} from "./repository";
import { backoffFor, MAX_ATTEMPTS, stepAt } from "./steps";

interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface TickDeps {
  /** `null` when EMAIL_SERVICE_URL is unset — the tick then does nothing. */
  email: EmailClient | null;
  logger: Logger;
  now?: () => Date;
  batchSize?: number;
  /** Polled between rows so shutdown does not have to wait out a whole batch. */
  shouldStop?: () => boolean;
}

export interface TickSummary {
  enrolled: number;
  reaped: number;
  claimed: number;
  sent: number;
  failed: number;
  completed: number;
  skipped: number;
}

const emptySummary = (): TickSummary => ({
  enrolled: 0,
  reaped: 0,
  claimed: 0,
  sent: 0,
  failed: 0,
  completed: 0,
  skipped: 0,
});

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * One pass of the drip: enrol, reap abandoned locks, claim what is due, send.
 *
 * Deliberately free of BullMQ and Redis so it can be unit tested against a
 * mocked Prisma and a stub email client, with no infrastructure at all.
 */
export const runTick = async (deps: TickDeps): Promise<TickSummary> => {
  const now = deps.now ?? (() => new Date());
  const batchSize = deps.batchSize ?? config.onboarding.batchSize;
  const shouldStop = deps.shouldStop ?? (() => false);
  const summary = emptySummary();

  if (!deps.email) {
    deps.logger.warn(
      "onboarding drip: no email service configured, skipping tick",
    );

    return summary;
  }

  summary.reaped = await releaseExpiredLocks(now());
  summary.enrolled = await enrolNewUsers();

  const lockId = randomUUID();
  const rows = await claimDueRows(lockId, now(), batchSize);
  summary.claimed = rows.length;

  for (const row of rows) {
    if (shouldStop()) {
      // Hand the row straight back rather than burning an attempt on it.
      await releaseRow(row.id, now());
      summary.skipped++;
      continue;
    }

    await processRow(row, deps, now, summary);
  }

  return summary;
};

const processRow = async (
  row: ClaimedRow,
  deps: TickDeps,
  now: () => Date,
  summary: TickSummary,
): Promise<void> => {
  const step = stepAt(row.sequenceIndex);

  if (!step) {
    // Past the end of the sequence: nothing left to send.
    await releaseRow(row.id, now());
    summary.skipped++;
    return;
  }

  if (step.id !== row.step) {
    deps.logger.error("onboarding drip: step out of sync, repairing", {
      queueId: row.id,
      sequenceIndex: row.sequenceIndex,
      stored: row.step,
      expected: step.id,
    });
    await repairStep(row.id, step.id, now());
    summary.skipped++;
    return;
  }

  const email = row.user.email;

  if (!email) {
    // `User.email` is nullable and the claim filters it out, but a row can lose
    // its address between claim and send.
    await releaseRow(row.id, now());
    summary.skipped++;
    return;
  }

  // Stable per user and step, so a duplicate claim cannot become a duplicate
  // delivery: Resend dedupes for 24h and the step gap is far longer.
  const idempotencyKey = `onboarding:${row.userId}:${step.id}`;

  const record = (
    extra: Pick<SendRecord, "succeeded" | "providerId" | "error">,
  ): SendRecord => ({
    queueId: row.id,
    userId: row.userId,
    step: step.id,
    sequenceIndex: row.sequenceIndex,
    attempt: row.attempts + 1,
    idempotencyKey,
    ...extra,
  });

  try {
    const result = await deps.email?.sendOnboardingStep(
      step.id as OnboardingStepId,
      {
        to: email,
        // "" would otherwise beat the schema's "there" default.
        userName: row.user.name || undefined,
        unsubscribeUrl: unsubscribeUrlFor(row.userId) ?? undefined,
        idempotencyKey,
      },
    );

    if (!result) {
      // The client is built with `throwOnError: false`, so a failed send after
      // its own retries surfaces as null rather than an exception.
      await fail(
        row,
        deps,
        now,
        summary,
        record,
        "email service rejected send",
      );
      return;
    }

    const done = await recordSuccess(
      row,
      record({ succeeded: true, providerId: result.id, error: null }),
      now(),
    );

    summary.sent++;

    if (done) {
      summary.completed++;
    }
  } catch (error: unknown) {
    await fail(row, deps, now, summary, record, describeError(error));
  }
};

const fail = async (
  row: ClaimedRow,
  deps: TickDeps,
  now: () => Date,
  summary: TickSummary,
  record: (
    extra: Pick<SendRecord, "succeeded" | "providerId" | "error">,
  ) => SendRecord,
  message: string,
): Promise<void> => {
  const attempts = row.attempts + 1;
  const giveUp = attempts >= MAX_ATTEMPTS;

  await recordFailure(
    row,
    record({ succeeded: false, providerId: null, error: message }),
    now(),
    { retryInMs: backoffFor(attempts), giveUp },
  );

  summary.failed++;

  if (giveUp) {
    deps.logger.error("onboarding drip: abandoning step after max attempts", {
      queueId: row.id,
      userId: row.userId,
      step: row.step,
      attempts,
      error: message,
    });
  } else {
    deps.logger.warn("onboarding drip: send failed, will retry", {
      queueId: row.id,
      step: row.step,
      attempts,
      error: message,
    });
  }
};

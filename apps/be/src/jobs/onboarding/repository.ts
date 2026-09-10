import { prisma } from "@4mica/db";
import { config } from "@config/index";
import { ONBOARDING_STEPS } from "./steps";

/** How long a worker may hold a claimed row before the reaper takes it back. */
export const LOCK_MS = 120_000;

/** Enrolment is bounded per tick so a large backlog drains gradually. */
const ENROL_LIMIT = 200;

export interface ClaimedRow {
  id: string;
  userId: string;
  sequenceIndex: number;
  step: string;
  attempts: number;
  user: { id: string; email: string | null; name: string };
}

/**
 * Only users who can actually be mailed. Applied identically at enrolment and
 * at claim time, so an opt-out between the two is caught by the second pass.
 *
 * Opting out is expressed here rather than by pausing the row: an opted-out
 * user is simply never claimed, so re-enabling the dashboard toggle resumes the
 * sequence with no extra code path.
 */
const eligibleUser = {
  email: { not: null },
  banned: false,
  locked: false,
  deletedAt: null,
  allowMarketingOnboardingEmails: true,
} as const;

/**
 * Give queue rows to users who lack one.
 *
 * This is the enrolment path — there is no "user created" hook. Users are
 * created lazily inside `loadUser` on the request critical path, so enrolling
 * there would add a write to every first authenticated request and would still
 * miss everyone who signed up before this shipped. A bounded sweep is
 * idempotent, self-healing, and touches no existing code.
 */
export const enrolNewUsers = async (): Promise<number> => {
  const candidates = await prisma.user.findMany({
    where: {
      ...eligibleUser,
      createdAt: { gte: config.onboarding.epoch },
      onboardingQueue: { is: null },
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: ENROL_LIMIT,
  });

  if (candidates.length === 0) {
    return 0;
  }

  const first = ONBOARDING_STEPS[0];

  const created = await prisma.onboardingEmailQueue.createMany({
    data: candidates.map((user) => ({
      userId: user.id,
      step: first.id,
      sequenceIndex: 0,
      nextAttemptAt: new Date(user.createdAt.getTime() + first.gapMs),
    })),
    // The userId unique index is the real guard; this just makes a concurrent
    // tick a no-op rather than an error.
    skipDuplicates: true,
  });

  return created.count;
};

/** Return rows abandoned by a crashed worker to the pool. */
export const releaseExpiredLocks = async (now: Date): Promise<number> => {
  const { count } = await prisma.onboardingEmailQueue.updateMany({
    where: { status: "SENDING", lockedUntil: { lt: now } },
    data: { status: "PENDING", lockId: null, lockedUntil: null },
  });

  return count;
};

/**
 * Claim up to `batchSize` due rows for this tick.
 *
 * Two statements rather than one: Prisma has no `UPDATE … RETURNING`, and an
 * unbounded `updateMany` would claim rows this tick will not process. Selecting
 * ids first bounds the claim; the `status`/`lockId` predicates in the update
 * keep it a compare-and-swap, so a concurrent tick cannot take the same row.
 */
export const claimDueRows = async (
  lockId: string,
  now: Date,
  batchSize: number,
): Promise<ClaimedRow[]> => {
  const due = await prisma.onboardingEmailQueue.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: now },
      user: eligibleUser,
    },
    select: { id: true },
    orderBy: { nextAttemptAt: "asc" },
    take: batchSize,
  });

  if (due.length === 0) {
    return [];
  }

  const { count } = await prisma.onboardingEmailQueue.updateMany({
    where: {
      id: { in: due.map((row) => row.id) },
      status: "PENDING",
      lockId: null,
    },
    data: {
      status: "SENDING",
      lockId,
      lockedUntil: new Date(now.getTime() + LOCK_MS),
      lastAttemptAt: now,
    },
  });

  if (count === 0) {
    return [];
  }

  return prisma.onboardingEmailQueue.findMany({
    where: { lockId, status: "SENDING" },
    select: {
      id: true,
      userId: true,
      sequenceIndex: true,
      step: true,
      attempts: true,
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { nextAttemptAt: "asc" },
  });
};

export interface SendRecord {
  queueId: string;
  userId: string;
  step: string;
  sequenceIndex: number;
  attempt: number;
  succeeded: boolean;
  providerId?: string | null;
  error?: string | null;
  idempotencyKey: string;
}

const truncate = (value: string): string => value.slice(0, 512);

/** Advance a row to the next step, or finish it. Audit row written atomically. */
export const recordSuccess = async (
  row: ClaimedRow,
  record: SendRecord,
  now: Date,
): Promise<boolean> => {
  const nextIndex = row.sequenceIndex + 1;
  const next = ONBOARDING_STEPS[nextIndex];
  const done = !next;

  await prisma.$transaction([
    prisma.onboardingEmailSend.create({ data: record }),
    prisma.onboardingEmailQueue.update({
      where: { id: row.id },
      data: {
        sequenceIndex: nextIndex,
        step: next?.id ?? row.step,
        status: done ? "COMPLETED" : "PENDING",
        attempts: 0,
        lastSentAt: now,
        lastProviderId: record.providerId ?? null,
        lastError: null,
        nextAttemptAt: done ? now : new Date(now.getTime() + next.gapMs),
        lockId: null,
        lockedUntil: null,
        completedAt: done ? now : null,
      },
    }),
    ...(done
      ? [
          prisma.user.update({
            where: { id: row.userId },
            data: { completeOnboarding: true },
          }),
        ]
      : []),
  ]);

  return done;
};

/**
 * Record a failure and schedule the retry — or, once the attempt budget is
 * spent, give up on this step and move the sequence on.
 */
export const recordFailure = async (
  row: ClaimedRow,
  record: SendRecord,
  now: Date,
  { retryInMs, giveUp }: { retryInMs: number; giveUp: boolean },
): Promise<void> => {
  const attempts = row.attempts + 1;
  const nextIndex = row.sequenceIndex + 1;
  const next = ONBOARDING_STEPS[nextIndex];
  const done = giveUp && !next;

  await prisma.$transaction([
    prisma.onboardingEmailSend.create({ data: record }),
    prisma.onboardingEmailQueue.update({
      where: { id: row.id },
      data: {
        ...(giveUp
          ? {
              sequenceIndex: nextIndex,
              step: next?.id ?? row.step,
              status: done ? "COMPLETED" : "PENDING",
              attempts: 0,
              nextAttemptAt: done ? now : new Date(now.getTime() + next.gapMs),
              completedAt: done ? now : null,
            }
          : {
              attempts,
              status: "PENDING",
              nextAttemptAt: new Date(now.getTime() + retryInMs),
            }),
        lastError: truncate(record.error ?? "send failed"),
        lockId: null,
        lockedUntil: null,
      },
    }),
  ]);
};

/** Resynchronise `step` when it disagrees with `sequenceIndex`. */
export const repairStep = async (
  id: string,
  step: string,
  now: Date,
): Promise<void> => {
  await prisma.onboardingEmailQueue.update({
    where: { id },
    data: {
      step,
      status: "PENDING",
      lockId: null,
      lockedUntil: null,
      nextAttemptAt: now,
    },
  });
};

/** Release a claimed row without consuming an attempt. */
export const releaseRow = async (id: string, now: Date): Promise<void> => {
  await prisma.onboardingEmailQueue.update({
    where: { id },
    data: {
      status: "PENDING",
      lockId: null,
      lockedUntil: null,
      nextAttemptAt: now,
    },
  });
};

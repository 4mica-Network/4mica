import { prisma } from "@4mica/db";
import { config } from "@config/index";
import { ONBOARDING_STEPS } from "./steps";

export const LOCK_MS = 120_000;

const ENROL_LIMIT = 200;

export interface ClaimedRow {
  id: string;
  userId: string;
  sequenceIndex: number;
  step: string;
  attempts: number;
  user: { id: string; email: string | null; name: string };
}

const eligibleUser = {
  email: { not: null },
  banned: false,
  locked: false,
  deletedAt: null,
  allowMarketingOnboardingEmails: true,
} as const;

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
    skipDuplicates: true,
  });

  return created.count;
};

export const releaseExpiredLocks = async (now: Date): Promise<number> => {
  const { count } = await prisma.onboardingEmailQueue.updateMany({
    where: { status: "SENDING", lockedUntil: { lt: now } },
    data: { status: "PENDING", lockId: null, lockedUntil: null },
  });

  return count;
};

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

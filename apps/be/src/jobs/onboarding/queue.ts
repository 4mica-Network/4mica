import type { ConnectionOptions } from "bullmq";
import { Queue, Worker } from "bullmq";
import type { TickSummary } from "./processor";

export const QUEUE_NAME = "onboarding-drip";
export const TICK_JOB_NAME = "tick";
export const SCHEDULER_KEY = "onboarding-drip-tick";

/** Namespaced so a Redis shared with anything else cannot collide. */
const PREFIX = "4mica";

/**
 * `maxRetriesPerRequest: null` is required by BullMQ workers — their blocking
 * reads must not be aborted by ioredis' own retry ceiling, and the Worker
 * constructor throws without it.
 *
 * A plain object rather than a shared ioredis instance, so `close()` on the
 * queue and worker actually disconnects.
 */
export const connectionFor = (url: string): ConnectionOptions => ({
  url,
  maxRetriesPerRequest: null,
});

export const createQueue = (url: string): Queue =>
  new Queue(QUEUE_NAME, {
    connection: connectionFor(url),
    prefix: PREFIX,
    defaultJobOptions: {
      // The next tick *is* the retry — every failure is already rescheduled in
      // Postgres, so a BullMQ retry would only run the sweep twice.
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });

/**
 * Idempotent by key: every replica booting at once converges on one schedule,
 * and a changed interval takes effect on the next deploy with no cleanup.
 */
export const ensureScheduler = async (
  queue: Queue,
  everyMs: number,
): Promise<void> => {
  await queue.upsertJobScheduler(
    SCHEDULER_KEY,
    { every: everyMs },
    { name: TICK_JOB_NAME },
  );
};

export const createWorker = (
  url: string,
  run: () => Promise<TickSummary>,
): Worker =>
  new Worker(QUEUE_NAME, async () => run(), {
    connection: connectionFor(url),
    prefix: PREFIX,
    // One tick at a time across every replica sharing this Redis.
    concurrency: 1,
    // A full batch of sends can outlast the 30s default; a premature "stalled"
    // verdict would hand the same rows to a second run.
    lockDuration: 120_000,
  });

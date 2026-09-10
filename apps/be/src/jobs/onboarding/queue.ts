import type { ConnectionOptions } from "bullmq";
import { Queue, Worker } from "bullmq";
import type { TickSummary } from "./processor";

export const QUEUE_NAME = "onboarding-drip";
export const TICK_JOB_NAME = "tick";
export const SCHEDULER_KEY = "onboarding-drip-tick";

const PREFIX = "4mica";

export const connectionFor = (url: string): ConnectionOptions => ({
  url,
  maxRetriesPerRequest: null,
});

export const createQueue = (url: string): Queue =>
  new Queue(QUEUE_NAME, {
    connection: connectionFor(url),
    prefix: PREFIX,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });

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
    concurrency: 1,
    lockDuration: 120_000,
  });

import type { ConnectionOptions } from "bullmq";
import { Queue, Worker } from "bullmq";
import type { RetentionSummary } from "./processor";

export const QUEUE_NAME = "audit-retention";
export const RUN_JOB_NAME = "purge";
export const SCHEDULER_KEY = "audit-retention-daily";
export const DAILY_PATTERN = "15 3 * * *";

const PREFIX = "4mica";

const connectionFor = (url: string): ConnectionOptions => ({
  url,
  maxRetriesPerRequest: null,
});

export const createQueue = (url: string): Queue =>
  new Queue(QUEUE_NAME, {
    connection: connectionFor(url),
    prefix: PREFIX,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 30 },
    },
  });

export const ensureScheduler = async (queue: Queue): Promise<void> => {
  await queue.upsertJobScheduler(
    SCHEDULER_KEY,
    { pattern: DAILY_PATTERN, tz: "UTC" },
    { name: RUN_JOB_NAME },
  );
};

export const createWorker = (
  url: string,
  run: () => Promise<RetentionSummary>,
): Worker =>
  new Worker(QUEUE_NAME, async () => run(), {
    connection: connectionFor(url),
    prefix: PREFIX,
    concurrency: 1,
    lockDuration: 600_000,
  });

import type { ConnectionOptions } from "bullmq";
import { Queue, Worker } from "bullmq";
import type { StreamSummary } from "./processor";

export const QUEUE_NAME = "audit-streams";
export const RUN_JOB_NAME = "deliver";
export const SCHEDULER_KEY = "audit-streams-every-30s";
export const EVERY_MS = 30_000;

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
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });

export const ensureScheduler = async (queue: Queue): Promise<void> => {
  await queue.upsertJobScheduler(
    SCHEDULER_KEY,
    { every: EVERY_MS },
    { name: RUN_JOB_NAME },
  );
};

export const createWorker = (
  url: string,
  run: () => Promise<StreamSummary>,
): Worker =>
  new Worker(QUEUE_NAME, async () => run(), {
    connection: connectionFor(url),
    prefix: PREFIX,
    concurrency: 1,
    lockDuration: 300_000,
  });

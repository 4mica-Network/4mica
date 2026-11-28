import type { ConnectionOptions } from "bullmq";
import { Queue, Worker } from "bullmq";
import type { ReconciliationSummary } from "./processor";

export const QUEUE_NAME = "payment-reconciliation";
export const RUN_JOB_NAME = "sweep";
export const SCHEDULER_KEY = "payment-reconciliation-sweep";
export const SWEEP_EVERY_MS = 60_000;

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
      removeOnComplete: { count: 60 },
      removeOnFail: { count: 60 },
    },
  });

export const ensureScheduler = async (queue: Queue): Promise<void> => {
  await queue.upsertJobScheduler(
    SCHEDULER_KEY,
    { every: SWEEP_EVERY_MS },
    { name: RUN_JOB_NAME },
  );
};

export const createWorker = (
  url: string,
  run: () => Promise<ReconciliationSummary>,
): Worker =>
  new Worker(QUEUE_NAME, async () => run(), {
    connection: connectionFor(url),
    prefix: PREFIX,
    concurrency: 1,
    lockDuration: 300_000,
  });

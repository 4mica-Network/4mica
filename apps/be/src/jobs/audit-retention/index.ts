import { config } from "@config/index";
import { createScopedLogger } from "@logger/index";
import type { Queue, Worker } from "bullmq";
import { runRetention } from "./processor";
import { createQueue, createWorker, ensureScheduler } from "./queue";

const logger = createScopedLogger("audit-retention");

let queue: Queue | undefined;
let worker: Worker | undefined;
let stopping = false;

export const startAuditRetention = async (): Promise<boolean> => {
  const url = config.onboarding.valkeyUrl;
  if (!url) {
    logger.warn("audit retention disabled: VALKEY_URL is unset");
    return false;
  }

  stopping = false;
  queue = createQueue(url);
  worker = createWorker(url, () =>
    runRetention({ logger, shouldStop: () => stopping }),
  );

  worker.on("error", (error) => {
    logger.error("audit retention: worker connection error", { error });
  });

  worker.on("failed", (_job, error) => {
    logger.error("audit retention: run failed", { error });
  });

  worker.on("completed", (_job, result) => {
    logger.info("audit retention: run done", { result });
  });

  await ensureScheduler(queue);
  logger.info("audit retention started");

  return true;
};

export const stopAuditRetention = async (): Promise<void> => {
  stopping = true;

  await worker?.close();
  await queue?.close();

  worker = undefined;
  queue = undefined;
};

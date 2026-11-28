import { config } from "@config/index";
import { createScopedLogger } from "@logger/index";
import { getEmailClient } from "@services/email";
import type { Queue, Worker } from "bullmq";
import { runReconciliation } from "./processor";
import { createQueue, createWorker, ensureScheduler } from "./queue";

const logger = createScopedLogger("payment-reconciliation");

let queue: Queue | undefined;
let worker: Worker | undefined;
let stopping = false;

export const startReconciliation = async (): Promise<boolean> => {
  const url = config.onboarding.valkeyUrl;
  if (!url) {
    logger.warn(
      "payment reconciliation retries disabled: VALKEY_URL is unset, so a failed reconciliation stays PENDING until the next report",
    );
    return false;
  }

  stopping = false;
  queue = createQueue(url);
  worker = createWorker(url, () =>
    runReconciliation({
      logger,
      email: getEmailClient(),
      shouldStop: () => stopping,
    }),
  );

  worker.on("error", (error) => {
    logger.error("payment reconciliation: worker connection error", { error });
  });

  worker.on("failed", (_job, error) => {
    logger.error("payment reconciliation: sweep failed", { error });
  });

  await ensureScheduler(queue);
  logger.info("payment reconciliation started");

  return true;
};

export const stopReconciliation = async (): Promise<void> => {
  stopping = true;

  await worker?.close();
  await queue?.close();

  worker = undefined;
  queue = undefined;
};

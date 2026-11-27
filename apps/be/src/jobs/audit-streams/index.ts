import { config } from "@config/index";
import { createScopedLogger } from "@logger/index";
import type { Queue, Worker } from "bullmq";
import { runAuditStreams } from "./processor";
import { createQueue, createWorker, ensureScheduler } from "./queue";

const logger = createScopedLogger("audit-streams");

let queue: Queue | undefined;
let worker: Worker | undefined;
let stopping = false;

export const startAuditStreams = async (): Promise<boolean> => {
  const url = config.onboarding.valkeyUrl;
  if (!url) {
    logger.warn("audit streaming disabled: VALKEY_URL is unset");
    return false;
  }
  const signingKey = config.auditStreams.signingKey;
  if (!signingKey) {
    logger.warn("audit streaming disabled: AUDIT_STREAM_SIGNING_KEY is unset");
    return false;
  }

  stopping = false;
  queue = createQueue(url);
  worker = createWorker(url, () =>
    runAuditStreams({ logger, signingKey, shouldStop: () => stopping }),
  );

  worker.on("error", (error) => {
    logger.error("audit streams: worker connection error", { error });
  });

  worker.on("failed", (_job, error) => {
    logger.error("audit streams: run failed", { error });
  });

  await ensureScheduler(queue);
  logger.info("audit streaming started");

  return true;
};

export const stopAuditStreams = async (): Promise<void> => {
  stopping = true;

  await worker?.close();
  await queue?.close();

  worker = undefined;
  queue = undefined;
};

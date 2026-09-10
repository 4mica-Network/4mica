import { config } from "@config/index";
import { createScopedLogger } from "@logger/index";
import type { Queue, Worker } from "bullmq";
import type { FastifyInstance } from "fastify";
import { runTick } from "./processor";
import { createQueue, createWorker, ensureScheduler } from "./queue";
import { STEP_COUNT } from "./steps";

const logger = createScopedLogger("onboarding");

let queue: Queue | undefined;
let worker: Worker | undefined;
let stopping = false;

export const resetOnboardingDrip = (): void => {
  queue = undefined;
  worker = undefined;
  stopping = false;
};

const disabledReason = (app: FastifyInstance): string | null => {
  if (!config.onboarding.valkeyUrl) {
    return "VALKEY_URL is unset";
  }

  if (!config.onboarding.unsubscribeSecret) {
    return "UNSUBSCRIBE_SECRET is unset";
  }

  if (!app.email) {
    return "EMAIL_SERVICE_URL is unset";
  }

  return null;
};

export const startOnboardingDrip = async (
  app: FastifyInstance,
): Promise<boolean> => {
  const reason = disabledReason(app);

  if (reason) {
    logger.warn(`onboarding drip disabled: ${reason}`);
    return false;
  }

  const url = config.onboarding.valkeyUrl as string;

  queue = createQueue(url);
  worker = createWorker(url, async () =>
    runTick({
      email: app.email,
      logger,
      shouldStop: () => stopping,
    }),
  );

  worker.on("error", (error) => {
    logger.error("onboarding drip: worker connection error", { error });
  });

  worker.on("failed", (_job, error) => {
    logger.error("onboarding drip: tick failed", { error });
  });

  worker.on("completed", (_job, result) => {
    logger.info("onboarding drip: tick done", { result });
  });

  await ensureScheduler(queue, config.onboarding.tickMs);

  app.addHook("onClose", stopOnboardingDrip);

  logger.info("onboarding drip started", {
    steps: STEP_COUNT,
    tickMs: config.onboarding.tickMs,
    gapMs: config.onboarding.stepGapMs,
    epoch: config.onboarding.epoch.toISOString(),
  });

  return true;
};

export const stopOnboardingDrip = async (): Promise<void> => {
  stopping = true;

  await worker?.close();
  await queue?.close();

  worker = undefined;
  queue = undefined;
};

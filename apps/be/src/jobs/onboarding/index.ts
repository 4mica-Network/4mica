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

/** Test seam, mirroring `resetEmailClient` in @services/email. */
export const resetOnboardingDrip = (): void => {
  queue = undefined;
  worker = undefined;
  stopping = false;
};

const disabledReason = (app: FastifyInstance): string | null => {
  if (!config.onboarding.redisUrl) {
    return "REDIS_URL is unset";
  }

  // Refusing to send without a working unsubscribe link is deliberate: thirty
  // marketing emails whose opt-out is dead is a CAN-SPAM/GDPR problem, so
  // "cannot unsubscribe" has to mean "do not send".
  if (!config.onboarding.unsubscribeSecret) {
    return "UNSUBSCRIBE_SECRET is unset";
  }

  if (!app.email) {
    return "EMAIL_SERVICE_URL is unset";
  }

  return null;
};

/**
 * Start the drip. Returns whether it actually started.
 *
 * Must be called from `runServer()` and never from `initApp()` — `initApp` is
 * what every test injects against, and starting a worker there would open a
 * Redis connection in each one.
 */
export const startOnboardingDrip = async (
  app: FastifyInstance,
): Promise<boolean> => {
  const reason = disabledReason(app);

  if (reason) {
    logger.warn(`onboarding drip disabled: ${reason}`);
    return false;
  }

  const url = config.onboarding.redisUrl as string;

  queue = createQueue(url);
  worker = createWorker(url, async () =>
    runTick({
      email: app.email,
      logger,
      shouldStop: () => stopping,
    }),
  );

  // Not optional. An unhandled ioredis error on the worker's connection
  // surfaces as an `uncaughtException`, which `installShutdownHandlers` turns
  // into a full shutdown — a brief Redis blip would take the whole API down.
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

/**
 * Closed from Fastify's `onClose`, which avvio runs before the Prisma
 * disconnect hook registered earlier in `initApp`, so an in-flight tick still
 * has a database. `stopping` bounds the wait to one in-flight email rather than
 * a whole batch, keeping `worker.close()` inside SHUTDOWN_TIMEOUT_MS.
 */
export const stopOnboardingDrip = async (): Promise<void> => {
  stopping = true;

  await worker?.close();
  await queue?.close();

  worker = undefined;
  queue = undefined;
};

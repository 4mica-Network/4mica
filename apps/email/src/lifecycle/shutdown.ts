import { config } from "@config/index";
import { appLogger, closeLoggers } from "@logger/index";
import type { FastifyInstance } from "fastify";
import { setServiceState } from "./state";

const SIGNALS = ["SIGINT", "SIGTERM"] as const;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface ShutdownOptions {
  failed?: boolean;
  drain?: boolean;
}

export const installShutdownHandlers = (app: FastifyInstance): void => {
  let shuttingDown = false;

  const shutdown = async (
    reason: string,
    { failed = false, drain = true }: ShutdownOptions = {},
  ): Promise<void> => {
    if (shuttingDown) {
      appLogger.warn("[shutdown] forced by repeat signal", { reason });
      process.exit(1);
    }
    shuttingDown = true;

    appLogger.info("[shutdown] start", { reason });

    const force = setTimeout(() => {
      appLogger.error("[shutdown] timed out, forcing exit", {
        timeoutMs: config.shutdown.timeoutMs,
      });
      process.exit(1);
    }, config.shutdown.timeoutMs);
    force.unref();

    let exitCode = failed ? 1 : 0;

    try {
      setServiceState("draining");
      appLogger.info("[shutdown] draining, health now reports unavailable");

      if (drain && config.shutdown.drainMs > 0) {
        await sleep(config.shutdown.drainMs);
        appLogger.info("[shutdown] drain window elapsed", {
          drainMs: config.shutdown.drainMs,
        });
      }

      setServiceState("closing");
      appLogger.info("[shutdown] closing fastify");
      await app.close();
      appLogger.info("[shutdown] fastify closed");
    } catch (error) {
      appLogger.error("[shutdown] failed", { error });
      exitCode = 1;
    } finally {
      clearTimeout(force);
      appLogger.info("[shutdown] complete, exiting", { exitCode });

      try {
        await closeLoggers();
      } catch {
        // Nothing left to log to.
      }

      process.exit(exitCode);
    }
  };

  for (const signal of SIGNALS) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  process.on("uncaughtException", (error) => {
    appLogger.error("Uncaught exception", { error });
    void shutdown("uncaughtException", { failed: true, drain: false });
  });

  process.on("unhandledRejection", (reason) => {
    appLogger.error("Unhandled rejection", { reason });
    void shutdown("unhandledRejection", { failed: true, drain: false });
  });
};

import * as Sentry from "@sentry/nextjs";
import {
  SERVER_TRACES_SAMPLE_RATE,
  sentryOptions,
  serializeError,
} from "@/lib/telemetry";
import { appLogger } from "@/logger";

Sentry.init(sentryOptions(SERVER_TRACES_SAMPLE_RATE));

process.on("unhandledRejection", (reason) => {
  appLogger.log({
    level: "error",
    message: "unhandled promise rejection",
    error: serializeError(reason),
  });
});

process.on("uncaughtExceptionMonitor", (error, origin) => {
  appLogger.log({
    level: "error",
    message: "uncaught exception",
    origin,
    error: serializeError(error),
  });
});

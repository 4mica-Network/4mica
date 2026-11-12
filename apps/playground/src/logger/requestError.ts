import "server-only";

import { serializeError } from "@/lib/telemetry";
import { appLogger } from "./loggers";

export interface RequestErrorContext {
  requestId?: string;
  upstreamRequestId?: string;
  method: string;
  routePath: string;
  routeType: string;
}

export const logRequestError = (
  error: unknown,
  context: RequestErrorContext,
) => {
  appLogger.log({
    level: "error",
    message: "request failed",
    ...context,
    digest:
      error instanceof Error && "digest" in error ? error.digest : undefined,
    error: serializeError(error),
  });
};

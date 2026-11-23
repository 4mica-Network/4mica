import "server-only";

import { headers } from "next/headers";
import type { Logger } from "winston";
import { REQUEST_ID_HEADER, UPSTREAM_REQUEST_ID_HEADER } from "@/lib/telemetry";
import { appLogger } from "./loggers";

export const requestLogger = async (): Promise<Logger> => {
  const incoming = await headers();
  const requestId = incoming.get(REQUEST_ID_HEADER);

  if (!requestId) {
    return appLogger;
  }

  const upstreamRequestId = incoming.get(UPSTREAM_REQUEST_ID_HEADER);

  return appLogger.child(
    upstreamRequestId ? { requestId, upstreamRequestId } : { requestId },
  );
};

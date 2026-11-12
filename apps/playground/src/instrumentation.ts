import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import {
  REQUEST_ID_HEADER,
  tagRequest,
  UPSTREAM_REQUEST_ID_HEADER,
} from "@/lib/telemetry";

const firstHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./instrumentation.edge");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const requestId = firstHeader(request.headers[REQUEST_ID_HEADER]);
  const upstreamRequestId = firstHeader(
    request.headers[UPSTREAM_REQUEST_ID_HEADER],
  );

  Sentry.withScope((scope) => {
    tagRequest(scope, { requestId, upstreamRequestId });
    Sentry.captureRequestError(error, request, context);
  });

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logRequestError } = await import("@/logger/requestError");
    logRequestError(error, {
      requestId,
      upstreamRequestId,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
    });
  }
};

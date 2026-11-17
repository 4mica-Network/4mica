import {
  ALLOWED_HEADERS,
  safeScrubBreadcrumb,
  safeScrubEvent,
  safeScrubLog,
  safeScrubSpan,
  telemetryScrubbingIntegration,
} from "@4mica/telemetry";
import * as Sentry from "@sentry/react";
import { routeName, TRACES_SAMPLE_RATE } from "./telemetryConfig";

export function initTelemetry(dsn: string): void {
  Sentry.init({
    dsn,
    environment:
      import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: __APP_VERSION__,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { allow: [...ALLOWED_HEADERS] },
        response: false,
      },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 5,
    },
    integrations: [
      Sentry.browserTracingIntegration({
        beforeStartSpan: (options) => ({
          ...options,
          name: routeName(window.location.pathname),
        }),
      }),
      telemetryScrubbingIntegration(),
    ],
    tracesSampleRate: TRACES_SAMPLE_RATE,
    tracePropagationTargets: [],
    beforeSend: safeScrubEvent,
    beforeSendSpan: safeScrubSpan,
    beforeBreadcrumb: safeScrubBreadcrumb,
    beforeSendLog: safeScrubLog,
    beforeSendMetric: () => null,
  });
}

export function captureError(error: unknown): void {
  Sentry.captureException(error);
}

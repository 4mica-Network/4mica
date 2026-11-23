import type { BrowserOptions } from "@sentry/nextjs";
import {
  ALLOWED_HEADERS,
  safeScrubBreadcrumb,
  safeScrubEvent,
  safeScrubLog,
  safeScrubSpan,
  telemetryScrubbingIntegration,
} from "./sentry";

type SamplingContext = Parameters<
  NonNullable<BrowserOptions["tracesSampler"]>
>[0];

export const SERVER_TRACES_SAMPLE_RATE = 0.2;
export const CLIENT_TRACES_SAMPLE_RATE = 0.1;

const FRAME_CONTEXT_LINES = 5;

const UNSAMPLED_ROUTES = /\/api\/health\b|\/_next\/|\/favicon\.ico/;

const SAMPLING_URL_ATTRIBUTES = [
  "url.path",
  "http.target",
  "url.full",
  "http.url",
];

const samplingTargets = (context: SamplingContext): string[] => {
  const targets = [context.name];

  for (const key of SAMPLING_URL_ATTRIBUTES) {
    const value = context.attributes?.[key];

    if (typeof value === "string") {
      targets.push(value);
    }
  }

  if (context.normalizedRequest?.url) {
    targets.push(context.normalizedRequest.url);
  }

  return targets;
};

export const sampleTraces =
  (rate: number) =>
  (context: SamplingContext): number =>
    samplingTargets(context).some((target) => UNSAMPLED_ROUTES.test(target))
      ? 0
      : context.inheritOrSampleWith(rate);

export const sentryOptions = (tracesSampleRate: number) => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

  return {
    dsn,
    enabled: Boolean(dsn),
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      "development",
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
      frameContextLines: FRAME_CONTEXT_LINES,
    },
    integrations: [telemetryScrubbingIntegration()],
    tracesSampler: sampleTraces(tracesSampleRate),
    beforeSend: safeScrubEvent,
    beforeSendSpan: safeScrubSpan,
    beforeBreadcrumb: safeScrubBreadcrumb,
    beforeSendLog: safeScrubLog,
    beforeSendMetric: () => null,
  };
};

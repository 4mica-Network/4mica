import * as Sentry from "@sentry/nextjs";
import { CLIENT_TRACES_SAMPLE_RATE, sentryOptions } from "@/lib/telemetry";

Sentry.init(sentryOptions(CLIENT_TRACES_SAMPLE_RATE));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

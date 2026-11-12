import * as Sentry from "@sentry/nextjs";
import { SERVER_TRACES_SAMPLE_RATE, sentryOptions } from "@/lib/telemetry";

Sentry.init(sentryOptions(SERVER_TRACES_SAMPLE_RATE));

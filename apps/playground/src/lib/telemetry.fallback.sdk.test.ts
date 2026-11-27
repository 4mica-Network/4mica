import * as Sentry from "@sentry/nextjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  FILTERED,
  INVALID_SPAN_ID,
  INVALID_TRACE_ID,
  safeScrubSpan,
  sentryOptions,
} from "./telemetry";

type Span = Parameters<typeof safeScrubSpan>[0];

const sent: string[] = [];
let corruptIds = false;

const hostile = () => {
  const record: Record<string, unknown> = {};
  Object.defineProperty(record, "boom", {
    enumerable: true,
    get() {
      throw new Error("getter exploded");
    },
  });
  return record;
};

const sabotage = (span: Span): Span =>
  ({
    ...span,
    ...(corruptIds ? { trace_id: "not-a-trace", span_id: "zz" } : {}),
    attributes: hostile(),
  }) as Span;

const spanItems = () =>
  sent
    .flatMap((body) => body.split("\n"))
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as { items?: Span[] };
        return parsed.items ?? [];
      } catch {
        return [];
      }
    })
    .filter((item) => "span_id" in item);

describe("span fallback inside the real Sentry SDK", () => {
  beforeAll(() => {
    Sentry.init({
      ...sentryOptions(1),
      dsn: "https://publickey@o1.ingest.sentry.io/1",
      enabled: true,
      defaultIntegrations: false,
      beforeSendSpan: (span) => safeScrubSpan(sabotage(span)),
      transport: (options: Parameters<typeof Sentry.createTransport>[0]) =>
        Sentry.createTransport(options, async (request) => {
          sent.push(String(request.body));
          return { statusCode: 200 };
        }),
    });
  });

  afterAll(async () => {
    await Sentry.close(2000);
  });

  beforeEach(() => {
    sent.length = 0;
  });

  const emit = async () => {
    Sentry.startSpan(
      {
        name: "GET /sso-callback?code=oauthcode123",
        forceTransaction: true,
        attributes: { note: "plain-attribute-marker" },
      },
      () => undefined,
    );
    await Sentry.flush(2000);
  };

  it("sends the stripped span, never the original, and keeps valid ids", async () => {
    corruptIds = false;
    await emit();

    const [span] = spanItems();
    expect(sent.join("\n")).not.toContain("oauthcode123");
    expect(sent.join("\n")).not.toContain("plain-attribute-marker");
    expect(sent.join("\n")).toContain(
      '"transaction":"GET /sso-callback?[Filtered]"',
    );
    expect(span?.name).toBe(FILTERED);
    expect(span?.trace_id).toMatch(/^(?!0{32})[0-9a-f]{32}$/);
    expect(span?.span_id).toMatch(/^(?!0{16})[0-9a-f]{16}$/);
  });

  it("marks malformed ids invalid instead of inventing a trace", async () => {
    corruptIds = true;
    await emit();

    const [span] = spanItems();
    expect(sent.join("\n")).not.toContain("oauthcode123");
    expect(sent.join("\n")).not.toContain("plain-attribute-marker");
    expect(sent.join("\n")).toContain(
      '"transaction":"GET /sso-callback?[Filtered]"',
    );
    expect(span?.trace_id).toBe(INVALID_TRACE_ID);
    expect(span?.span_id).toBe(INVALID_SPAN_ID);
    expect(span?.name).toBe(FILTERED);
  });
});

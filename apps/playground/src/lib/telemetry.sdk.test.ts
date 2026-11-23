import * as Sentry from "@sentry/nextjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FILTERED, sentryOptions } from "./telemetry";
import { FAKE_SECRETS } from "./telemetry/fakeSecrets";

const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMyJ9.c2lnbmF0dXJlLXZhbHVl";
const SECRETS = [
  JWT,
  "shortSecret123",
  "hunter2",
  FAKE_SECRETS.liveSecretKey,
  "mo@example.com",
  "oauthcode123",
];

const sent: string[] = [];

const memoryTransport = (
  options: Parameters<typeof Sentry.createTransport>[0],
) =>
  Sentry.createTransport(options, async (request) => {
    sent.push(
      typeof request.body === "string"
        ? request.body
        : new TextDecoder().decode(request.body),
    );
    return { statusCode: 200 };
  });

const flushed = async () => {
  await Sentry.flush(2000);
  return sent.join("\n");
};

const expectClean = (payload: string) => {
  for (const secret of SECRETS) {
    expect(payload).not.toContain(secret);
  }
};

describe("Sentry SDK with the playground hooks", () => {
  beforeAll(() => {
    Sentry.init({
      ...sentryOptions(1),
      dsn: "https://publickey@o1.ingest.sentry.io/1",
      enabled: true,
      transport: memoryTransport,
      defaultIntegrations: false,
    });
  });

  afterAll(async () => {
    await Sentry.close(2000);
  });

  beforeEach(() => {
    sent.length = 0;
  });

  it("scrubs a captured exception, its cause, tags, extras and breadcrumbs", async () => {
    Sentry.addBreadcrumb({
      category: "navigation",
      message: "to callback?code=oauthcode123",
      data: { to: `/sign-in?token=${JWT}` },
    });

    Sentry.withScope((scope) => {
      scope.setTag("note", "contact mo@example.com");
      scope.setExtra("headers", { authorization: "Bearer shortSecret123" });
      scope.setExtra("raw", "authorization: Bearer shortSecret123");
      Sentry.captureException(
        new Error("connect postgres://admin:hunter2@db/app failed", {
          cause: new Error(`retry with ${JWT}`),
        }),
      );
    });

    const payload = await flushed();
    expect(payload).toContain('"type":"event"');
    expect(payload).toContain(FILTERED);
    expectClean(payload);
  });

  it("scrubs messages sent with captureMessage", async () => {
    Sentry.captureMessage(
      `login ${FAKE_SECRETS.liveSecretKey} for mo@example.com with authorization: Bearer shortSecret123`,
    );

    const payload = await flushed();
    expect(payload).toContain('"type":"event"');
    expectClean(payload);
  });

  it("scrubs structured logs", async () => {
    Sentry.logger.error("request failed for mo@example.com", {
      path: "/sso-callback?code=oauthcode123",
      error: { message: `upstream rejected ${JWT}` },
    });

    const payload = await flushed();
    expect(payload).toContain('"type":"log"');
    expectClean(payload);
  });

  it("scrubs span names and attributes", async () => {
    Sentry.startSpan(
      {
        name: "GET /sso-callback?code=oauthcode123",
        forceTransaction: true,
        attributes: {
          "url.full": `https://4mica.io/sign-in?token=${JWT}`,
          "db.statement": "select * where email = 'mo@example.com'",
        },
      },
      () => undefined,
    );

    const payload = await flushed();
    expect(payload).toContain("sso-callback");
    expect(payload).toContain('"transaction":"GET /sso-callback?[Filtered]"');
    expectClean(payload);
  });

  it("scrubs parameterized Sentry.logger messages and their parameters", async () => {
    Sentry.logger.warn(
      Sentry.logger.fmt`login for ${"mo@example.com"} with ${JWT}`,
      { "http.response.header.x-internal-key": "oauthcode123" },
    );

    const payload = await flushed();
    expect(payload).toContain('"type":"log"');
    expect(payload).not.toContain("x-internal-key");
    expectClean(payload);
  });

  it("scrubs fingerprints passed to captureException", async () => {
    Sentry.captureException(new Error("declined"), {
      fingerprint: ["payment", "customer mo@example.com", JWT],
    });

    const payload = await flushed();
    expect(payload).toContain(
      '"fingerprint":["payment","customer [Filtered]","[Filtered]"]',
    );
    expectClean(payload);
  });

  it("drops response-header attributes from real spans", async () => {
    Sentry.startSpan(
      {
        name: "GET /mo",
        forceTransaction: true,
        attributes: {
          "http.response.header.x-internal-key": "oauthcode123",
          "http.request.header.user-agent": "UA",
        },
      },
      () => undefined,
    );

    const payload = await flushed();
    expect(payload).toContain("http.request.header.user-agent");
    expect(payload).not.toContain("x-internal-key");
    expectClean(payload);
  });

  it("sends no metrics", async () => {
    Sentry.metrics.count("payment.attempt", 1, {
      attributes: { card: "4242424242424242" },
    });

    const payload = await flushed();
    expect(payload).not.toContain("payment.attempt");
    expect(payload).not.toContain("4242424242424242");
  });

  it("drops scope user data that the SDK copies onto spans", async () => {
    Sentry.withScope((scope) => {
      scope.setUser({
        id: "user_2abc",
        email: "mo@example.com",
        ip_address: "203.0.113.7",
        username: "oauthcode123",
      });
      Sentry.startSpan(
        { name: "GET /mo", forceTransaction: true },
        () => undefined,
      );
    });

    const payload = await flushed();
    expect(payload).toContain('"name":"GET /mo"');
    expect(payload).not.toContain("user.");
    expect(payload).not.toContain("203.0.113.7");
    expectClean(payload);
  });

  it("drops custom contexts and tags carrying a payment payload", async () => {
    Sentry.withScope((scope) => {
      scope.setContext("payment", {
        cardHolder: "Ada Lovelace",
        merchantRef: "ORDER-77-PRIVATE",
      });
      scope.setTag("merchant_ref", "ORDER-77-PRIVATE");
      scope.setTag("request_id", "0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c");
      Sentry.captureException(new Error("declined"));
    });

    const payload = await flushed();
    expect(payload).toContain(
      '"request_id":"0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c"',
    );
    expect(payload).not.toContain("Ada Lovelace");
    expect(payload).not.toContain("ORDER-77-PRIVATE");
  });
});

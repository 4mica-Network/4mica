import type { ErrorEvent, Log } from "@sentry/nextjs";
import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_CONTEXTS,
  ALLOWED_TAGS,
  createRequestId,
  FILTERED,
  INVALID_SPAN_ID,
  INVALID_TRACE_ID,
  MAX_SCRUB_INPUT_LENGTH,
  MAX_STRING_LENGTH,
  NOT_ALLOWLISTED,
  parseUpstreamRequestId,
  REDACTION_FAILED,
  redactLogInfo,
  safeScrubBreadcrumb,
  safeScrubEvent,
  safeScrubLog,
  safeScrubSpan,
  safeStringify,
  sampleTraces,
  scrubBreadcrumb,
  scrubDynamicSamplingContext,
  scrubEvent,
  scrubLog,
  scrubRecord,
  scrubSpan,
  scrubText,
  scrubUrl,
  sentryOptions,
  serializeError,
  TRUNCATED,
  tagRequest,
} from "./telemetry";
import { FAKE_SECRETS } from "./telemetry/fakeSecrets";

const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMyJ9.c2lnbmF0dXJlLXZhbHVl";
const WALLET = "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09";
const PRIVATE_KEY = `0x${"ab12".repeat(16)}`;

describe("request ids", () => {
  it("always creates a fresh UUID", () => {
    const first = createRequestId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(createRequestId()).not.toBe(first);
  });

  it("accepts a well-formed upstream id only as a label", () => {
    expect(parseUpstreamRequestId("0f3a9c2b7e8d4f1a0b2c3d4e5f6a7b8c")).toBe(
      "0f3a9c2b7e8d4f1a0b2c3d4e5f6a7b8c",
    );

    for (const bad of [
      null,
      undefined,
      "",
      "short",
      "a".repeat(65),
      "abc\ndef0123456789xyz",
    ]) {
      expect(parseUpstreamRequestId(bad)).toBeUndefined();
    }
  });
});

describe("scrubUrl", () => {
  it("drops the whole query, keys included, and the hash", () => {
    expect(
      scrubUrl("https://4mica.io/mo?__clerk_handshake=eyJ.abc&tab=apis#top"),
    ).toBe(`https://4mica.io/mo?${FILTERED}`);
    expect(scrubUrl("/mo?email_of_user=x")).toBe(`/mo?${FILTERED}`);
  });

  it("leaves URLs without a query alone and strips a bare hash", () => {
    expect(scrubUrl("/mo/agents/atlas")).toBe("/mo/agents/atlas");
    expect(scrubUrl("/mo#reviews")).toBe("/mo");
    expect(scrubUrl("/mo?")).toBe("/mo");
  });
});

describe("scrubText", () => {
  it.each([
    ["a JWT", `session ${JWT} expired`],
    ["a bearer token", "Authorization failed for Bearer abcdef0123456789xyz"],
    ["a Clerk secret key", `bad key ${FAKE_SECRETS.testSecretKey}`],
    ["a Clerk publishable key", FAKE_SECRETS.livePublishableKey],
    ["a Sentry token", FAKE_SECRETS.sentryToken],
    ["a GitHub token", FAKE_SECRETS.githubToken],
    ["a Slack token", FAKE_SECRETS.slackToken],
    ["an AWS key", FAKE_SECRETS.awsAccessKey],
    ["a private key", `signer ${PRIVATE_KEY}`],
    ["an email", "contact mo@example.com now"],
    ["a high-entropy token", `token ${FAKE_SECRETS.highEntropy}`],
  ])("removes %s", (_label, input) => {
    expect(scrubText(input)).toContain(FILTERED);
  });

  it("removes credentials and queries inside connection strings and URLs", () => {
    expect(
      scrubText(
        "connect postgres://admin:hunter2@db.internal:5432/app failed, see https://x.io/cb?code=abc",
      ),
    ).toBe(
      `connect postgres://${FILTERED}@db.internal:5432/app failed, see https://x.io/cb?${FILTERED}`,
    );
  });

  it("removes values of sensitive key/value pairs", () => {
    expect(scrubText('password=hunter2 token: "abc def" status=ok')).toBe(
      `password=${FILTERED} token: ${FILTERED} status=ok`,
    );
  });

  it("keeps request ids, wallet addresses, file paths and prose", () => {
    const text = [
      "request 0f3a9c2b7e8d4f1a0b2c3d4e5f6a7b8c",
      "uuid fbc08180-bfd0-416b-80a5-f384f55a0d01",
      `wallet ${WALLET}`,
      "at /app/apps/playground/.next/server/chunks/_1dmvsb2._.js:12:3",
      "clerk session resolution failed; treating as signed out",
    ].join("\n");

    expect(scrubText(text)).toBe(text);
  });
});

describe("scrubRecord", () => {
  it("filters sensitive keys and secret-looking values at any depth", () => {
    expect(
      scrubRecord({
        authorization: "Bearer x",
        nested: { password: "p", list: [{ apiKey: "k", note: JWT, ok: 1 }] },
        username: "mo",
        email: "mo@example.com",
        path: "/mo?__clerk_handshake=jwt",
      }),
    ).toEqual({
      authorization: FILTERED,
      nested: {
        password: FILTERED,
        list: [{ apiKey: FILTERED, note: FILTERED, ok: 1 }],
      },
      username: "mo",
      email: FILTERED,
      path: `/mo?${FILTERED}`,
    });
  });

  it("truncates instead of passing deep values through", () => {
    let deep: Record<string, unknown> = { secretless: JWT };
    for (let i = 0; i < 10; i++) {
      deep = { child: deep };
    }

    expect(JSON.stringify(scrubRecord(deep))).not.toContain("eyJ");
    expect(JSON.stringify(scrubRecord(deep))).toContain(TRUNCATED);
  });

  it("survives cycles", () => {
    const cyclic: Record<string, unknown> = { name: "a" };
    cyclic.self = cyclic;

    expect(scrubRecord(cyclic)).toEqual({ name: "a", self: TRUNCATED });
  });

  it("does not mutate its input", () => {
    const input = { token: "t" };
    scrubRecord(input);
    expect(input.token).toBe("t");
  });
});

describe("redactLogInfo", () => {
  const LEVEL = Symbol.for("level");
  const SPLAT = Symbol.for("splat");

  it("returns a new, scrubbed object that keeps winston's level symbol", () => {
    const info = {
      level: "warn",
      message: `hi ${JWT}`,
      requestId: "0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c",
      error: { message: "token=abc", stack: "at x" },
      [LEVEL]: "warn",
      [SPLAT]: [JWT],
    };
    const result = redactLogInfo(info);

    expect(result).not.toBe(info);
    expect(result).toEqual({
      level: "warn",
      message: `hi ${FILTERED}`,
      requestId: "0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c",
      error: { message: `token=${FILTERED}`, stack: "at x" },
      [LEVEL]: "warn",
    });
    expect(info.message).toBe(`hi ${JWT}`);
  });

  it("replaces fields outside the log allowlist", () => {
    const result = redactLogInfo({
      level: "info",
      message: "payment created",
      paymentUrl: "https://example.com/pay/secret-value",
      metadata: { customField: "sensitive but unrecognized" },
      wallet: `0x${"ab".repeat(32)}`,
    });

    expect(result).toEqual({
      level: "info",
      message: "payment created",
      paymentUrl: NOT_ALLOWLISTED,
      metadata: NOT_ALLOWLISTED,
      wallet: NOT_ALLOWLISTED,
      [LEVEL]: "info",
    });
  });
});

describe("serializeError", () => {
  it("scrubs secrets from message, stack and cause", () => {
    const cause = new Error(`upstream rejected ${JWT}`);
    const error = new Error(
      "connect postgres://admin:hunter2@db/app failed for mo@example.com",
      { cause },
    );

    const serialized = serializeError(error);
    const json = JSON.stringify(serialized);

    expect(serialized.name).toBe("Error");
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("mo@example.com");
    expect(json).not.toContain("eyJ");
    expect(serialized.stack).toContain(FILTERED);
  });

  it("stringifies non-errors through the same scrubber", () => {
    expect(serializeError(42)).toEqual({ message: "42" });
    expect(serializeError(`bad ${JWT}`)).toEqual({
      message: `bad ${FILTERED}`,
    });
  });
});

describe("scrubEvent", () => {
  it("scrubs request, user, message, tags, exception and breadcrumbs", () => {
    const event = scrubEvent({
      type: undefined,
      message: `failed with ${JWT}`,
      logentry: { message: "token=abc", params: [JWT] },
      transaction: "GET /mo?token=t",
      tags: { request_id: "rid", session_token: "s", note: JWT },
      request: {
        method: "GET",
        url: `https://4mica.io/${FAKE_SECRETS.testSecretKey}/mo?code=abc`,
        cookies: { __session: "jwt" },
        data: { secret: 1 },
        query_string: "code=abc",
        headers: {
          Cookie: "__session=jwt",
          Authorization: "Bearer x",
          "User-Agent": "UA",
          Referer: "https://4mica.io/sign-in?redirect_url=/mo",
          "x-request-id": "rid",
        },
      },
      user: { id: "u", ip_address: "1.2.3.4", email: "e@x.io" },
      exception: {
        values: [
          {
            type: "Error",
            value: "connect postgres://u:p@h/db",
            mechanism: { type: "generic", data: { token: "t", where: JWT } },
            stacktrace: {
              frames: [
                {
                  filename: "app.js",
                  vars: { password: "p" },
                  context_line: `const key = "${FAKE_SECRETS.testSecretKey}";`,
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [
        { category: "console", message: "m", data: { arguments: ["x"] } },
        { category: "fetch", message: JWT, data: { url: "/api/x?token=t" } },
      ],
      extra: { session: "s", route: "/mo" },
      contexts: {
        trace: { trace_id: "t", span_id: "s" },
        custom: { token: "t", note: JWT },
      },
    } as ErrorEvent);

    expect(event.request).toEqual({
      method: "GET",
      url: `https://4mica.io/${FILTERED}/mo?${FILTERED}`,
      headers: {
        "user-agent": "UA",
        referer: `https://4mica.io/sign-in?${FILTERED}`,
      },
    });
    expect(event.user).toBeUndefined();
    expect(event.message).toBe(`failed with ${FILTERED}`);
    expect(event.logentry).toEqual({
      message: `token=${FILTERED}`,
      params: [FILTERED],
    });
    expect(event.transaction).toBe(`GET /mo?${FILTERED}`);
    expect(event.tags).toEqual({ request_id: "rid" });

    const exception = event.exception?.values?.[0];
    expect(exception?.value).toBe(`connect postgres://${FILTERED}@h/db`);
    expect(exception?.mechanism?.data).toEqual({
      token: FILTERED,
      where: FILTERED,
    });
    expect(exception?.stacktrace?.frames?.[0]?.vars).toBeUndefined();
    expect(exception?.stacktrace?.frames?.[0]?.context_line).not.toContain(
      "sk_test",
    );

    expect(event.breadcrumbs?.[0]?.data).toBeUndefined();
    expect(event.breadcrumbs?.[1]?.message).toBe(FILTERED);
    expect(event.breadcrumbs?.[1]?.data?.url).toBe(`/api/x?${FILTERED}`);
    expect(event.extra).toBeUndefined();
    expect(event.contexts).toEqual({
      trace: { trace_id: "t", span_id: "s" },
    });
  });
});

describe("scrubBreadcrumb", () => {
  it("scrubs navigation from/to", () => {
    expect(
      scrubBreadcrumb({
        category: "navigation",
        data: { from: "/a?x=1", to: "/b?y=2" },
      }).data,
    ).toEqual({ from: `/a?${FILTERED}`, to: `/b?${FILTERED}` });
  });
});

describe("scrubSpan", () => {
  it("scrubs the name and attributes and drops raw query attributes", () => {
    const span = scrubSpan({
      trace_id: "t",
      span_id: "s",
      name: "GET /mo?token=abc",
      start_timestamp: 1,
      status: "ok",
      is_segment: true,
      attributes: {
        "url.full": "https://4mica.io/mo?token=abc",
        "url.query": "token=abc",
        "http.request.header.cookie": "c",
        "http.request.header.referer": ["https://4mica.io/x?token=t"],
        "http.route": "/[username]",
      },
    });

    expect(span.name).toBe(`GET /mo?${FILTERED}`);
    expect(span.attributes).toEqual({
      "url.full": `https://4mica.io/mo?${FILTERED}`,
      "http.request.header.referer": [`https://4mica.io/x?${FILTERED}`],
      "http.route": "/[username]",
    });
  });
});

describe("scrubLog", () => {
  it("scrubs the message and attributes", () => {
    const log = scrubLog({
      level: "error",
      message: `request failed ${JWT}`,
      attributes: { path: { value: "/mo?token=t", type: "string" } },
    } as Log);

    expect(log.message).toBe(`request failed ${FILTERED}`);
    expect(log.attributes).toEqual({
      path: { value: `/mo?${FILTERED}`, type: "string" },
    });
  });
});

describe("sampleTraces", () => {
  const context = (name: string) => ({
    name,
    attributes: {},
    inheritOrSampleWith: vi.fn((rate: number) => rate),
  });

  it("never samples health checks or static assets", () => {
    const sampler = sampleTraces(0.5);

    for (const name of ["GET /api/health", "GET /_next/static/chunk.js"]) {
      const ctx = context(name);
      expect(sampler(ctx)).toBe(0);
      expect(ctx.inheritOrSampleWith).not.toHaveBeenCalled();
    }
  });

  it("excludes health checks named only by method at sampling time", () => {
    const sampler = sampleTraces(0.5);

    for (const attributes of [
      { "http.target": "/api/health" },
      { "url.full": "http://localhost:3100/api/health" },
      { "url.path": "/api/health" },
    ]) {
      const ctx = { ...context("GET"), attributes };
      expect(sampler(ctx)).toBe(0);
      expect(ctx.inheritOrSampleWith).not.toHaveBeenCalled();
    }

    const fromRequest = {
      ...context("GET"),
      normalizedRequest: { url: "http://localhost:3100/api/health" },
    };
    expect(sampler(fromRequest)).toBe(0);
  });

  it("defers to the parent decision, falling back to the rate", () => {
    const sampler = sampleTraces(0.5);
    const ctx = context("GET /[username]");
    ctx.inheritOrSampleWith.mockReturnValueOnce(1);

    expect(sampler(ctx)).toBe(1);
    expect(ctx.inheritOrSampleWith).toHaveBeenCalledWith(0.5);
  });
});

describe("sentryOptions", () => {
  it("wires the traces sampler with the given rate", () => {
    const options = sentryOptions(0.25);
    const inherit = vi.fn((rate: number) => rate);
    const ctx = {
      name: "GET /mo",
      attributes: {},
      inheritOrSampleWith: inherit,
    };

    expect(options.tracesSampler(ctx)).toBe(0.25);
    expect(inherit).toHaveBeenCalledWith(0.25);
    expect(
      options.tracesSampler({
        name: "GET",
        attributes: { "url.path": "/api/health" },
        inheritOrSampleWith: inherit,
      }),
    ).toBe(0);
  });

  it("stays disabled without a DSN and opts out of personal data", () => {
    const options = sentryOptions(0.1);
    expect(options.enabled).toBe(Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN));
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    });
  });
});

describe("security regression", () => {
  const SECRETS = [
    JWT,
    "Bearer abcdef0123456789xyz",
    FAKE_SECRETS.liveSecretKey,
    FAKE_SECRETS.sentryToken,
    FAKE_SECRETS.githubToken,
    FAKE_SECRETS.awsAccessKey,
    PRIVATE_KEY,
    "mo@example.com",
  ];

  const expectClean = (value: unknown) => {
    const json = JSON.stringify(value);
    for (const secret of SECRETS) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("abc123");
  };

  const nest = (depth: number, leaf: unknown): unknown => {
    let value: unknown = leaf;
    for (let i = 0; i < depth; i++) {
      value = { level: value };
    }
    return value;
  };

  it.each(
    Array.from({ length: 10 }, (_, i) => i + 1),
  )("never leaks a secret nested %i levels deep", (depth) => {
    expectClean(scrubRecord({ root: nest(depth, `x ${JWT} y`) }));
    expectClean(scrubRecord({ root: nest(depth, { password: "hunter2" }) }));
    expectClean(scrubRecord({ root: nest(depth, [SECRETS]) }));
  });

  it("keeps repeated, non-circular references intact", () => {
    const shared = { chainId: 84532, label: "base-sepolia" };
    expect(
      scrubRecord({ a: shared, b: shared, list: [shared, shared] }),
    ).toEqual({ a: shared, b: shared, list: [shared, shared] });
  });

  it("truncates only true cycles, including through arrays and errors", () => {
    const node: Record<string, unknown> = { name: "n" };
    node.children = [node];
    const error = new Error("loop");
    (error as Error & { cause?: unknown }).cause = error;

    expect(scrubRecord({ node })).toEqual({
      node: { name: "n", children: [TRUNCATED] },
    });
    expect(serializeError(error).cause).toEqual({ message: TRUNCATED });
  });

  it.each([
    "callback?code=abc123&state=xyz",
    "sso-callback?code=abc123",
    "./oauth/return?access_token=abc123",
    "redirect to ../auth?code=abc123 now",
    "/sign-in?redirect_url=%2Fmo%3Fcode%3Dabc123",
    "next=%2Fcallback%3Fcode%3Dabc123",
    "code=abc123&state=xyz",
    "https://4mica.io/sso-callback?code=abc123#state",
  ])("removes OAuth and redirect parameters from %s", (input) => {
    expect(scrubText(input)).not.toContain("abc123");
  });

  it("does not eat ordinary questions or prose", () => {
    for (const text of [
      "is the profile public? yes",
      "HTTP status code 404",
      "state machine: ready",
    ]) {
      expect(scrubText(text)).toBe(text);
    }
  });

  it("keeps public payment identifiers useful for debugging", () => {
    const txHash = `0x${"cd34".repeat(16)}`;
    const record = scrubRecord({
      wallet: WALLET,
      txHash,
      transaction_hash: txHash,
      chainId: 84532,
      requestId: "0f3a9c2b7e8d4f1a0b2c3d4e5f6a7b8c",
      signature: txHash,
      privateKey: txHash,
      note: `paid from ${WALLET}`,
    });

    expect(record).toEqual({
      wallet: WALLET,
      txHash,
      transaction_hash: txHash,
      chainId: 84532,
      requestId: "0f3a9c2b7e8d4f1a0b2c3d4e5f6a7b8c",
      signature: FILTERED,
      privateKey: FILTERED,
      note: `paid from ${WALLET}`,
    });
  });

  it("scrubs every string in exception frames and nested mechanism data", () => {
    const event = scrubEvent({
      type: undefined,
      exception: {
        values: [
          {
            type: `AuthError ${JWT}`,
            value: `callback?code=abc123 for mo@example.com`,
            mechanism: {
              type: "generic",
              data: {
                nested: { deeper: { token: "t", note: JWT } },
              } as unknown as Record<string, string>,
            },
            stacktrace: {
              frames: [
                {
                  filename: "https://4mica.io/p/_next/chunk.js?token=abc123",
                  abs_path: "app:///callback?code=abc123",
                  function: `handle ${JWT}`,
                  module: FAKE_SECRETS.liveSecretKey,
                  context_line: `const pwd = "password=hunter2";`,
                  pre_context: [`// ${JWT}`],
                  post_context: ["mo@example.com"],
                  vars: { password: "hunter2" },
                },
              ],
            },
          },
        ],
      },
    } as ErrorEvent);

    expectClean(event);
    expect(event.exception?.values?.[0]?.mechanism?.data?.nested).toEqual(
      JSON.stringify({ deeper: { token: FILTERED, note: FILTERED } }),
    );
  });

  it("scrubs Error.cause chains and non-error causes", () => {
    const root = new Error("db rejected postgres://admin:hunter2@db/app");
    const middle = new Error(`retry with ${JWT}`, { cause: root });
    const top = new Error("payment failed", {
      cause: { attempt: middle, apiKey: FAKE_SECRETS.liveSecretKey },
    });

    expectClean(serializeError(top));
  });

  it("scrubs breadcrumbs, logs and spans end to end", () => {
    expectClean(
      scrubBreadcrumb({
        category: "navigation",
        message: `to callback?code=abc123 ${JWT}`,
        data: {
          from: "/a",
          to: "sso-callback?code=abc123",
          nested: [{ email: "x" }],
        },
      }),
    );
    expectClean(
      scrubLog({
        level: "warn",
        message: `login for mo@example.com with ${JWT}`,
        attributes: { error: { value: { stack: `at x (${PRIVATE_KEY})` } } },
      } as unknown as Log),
    );
    expectClean(
      scrubSpan({
        trace_id: "t",
        span_id: "s",
        name: "GET callback?code=abc123",
        start_timestamp: 1,
        status: "ok",
        is_segment: false,
        attributes: { "db.statement": `select * where key = '${PRIVATE_KEY}'` },
      }),
    );
  });

  it("samples ordinary routes but never health checks or static assets", () => {
    const sampler = sampleTraces(0.2);
    const ctx = (name: string, attributes: Record<string, unknown> = {}) => ({
      name,
      attributes,
      inheritOrSampleWith: (rate: number) => rate,
    });

    expect(sampler(ctx("GET /api/og/[username]"))).toBe(0.2);
    expect(sampler(ctx("GET", { "url.path": "/api/og/mo" }))).toBe(0.2);
    expect(sampler(ctx("GET", { "url.path": "/api/health" }))).toBe(0);
    expect(sampler(ctx("GET", { "http.target": "/_next/static/a.js" }))).toBe(
      0,
    );
    expect(sampler(ctx("GET /favicon.ico"))).toBe(0);
  });
});

describe("review round 3", () => {
  const hostile = () => {
    const record: Record<string, unknown> = { leak: "hunter2" };
    Object.defineProperty(record, "boom", {
      enumerable: true,
      get() {
        throw new Error("getter exploded");
      },
    });
    return record;
  };

  it.each([
    ["authorization: Bearer shortSecret123", "shortSecret123"],
    ["Authorization=Basic dXNlcjpwYXNzd29yZA==", "dXNlcjpwYXNzd29yZA"],
    ['token: "Token abc def ghi"', "abc def"],
    ["proxy-authorization: Negotiate YIIabc123", "YIIabc123"],
    ["x-api-key: Bearer short1", "short1"],
  ])("leaves nothing of a multi-word credential in %s", (input, secret) => {
    expect(scrubText(input)).not.toContain(secret);
    expect(scrubText(input)).toContain(FILTERED);
  });

  it("keeps only named blockchain hashes, not any field called hash", () => {
    const value = `0x${"ef56".repeat(16)}`;

    expect(
      scrubRecord({
        txHash: value,
        tx_hash: value,
        transactionHash: value,
        blockHash: value,
        txid: value,
        hash: value,
        passwordHash: value,
        receiptHash: value,
        eventHash: value,
      }),
    ).toEqual({
      txHash: value,
      tx_hash: value,
      transactionHash: value,
      blockHash: value,
      txid: value,
      hash: FILTERED,
      passwordHash: FILTERED,
      receiptHash: FILTERED,
      eventHash: FILTERED,
    });
  });

  it("serialises without throwing on bigints, cycles and undefined", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(safeStringify({ amount: 123n })).toBe('{"amount":"123"}');
    expect(safeStringify(cyclic)).toBe(TRUNCATED);
    expect(safeStringify(undefined)).toBe("undefined");
  });

  it("stringifies bigint mechanism data instead of throwing", () => {
    const event = scrubEvent({
      type: undefined,
      exception: {
        values: [
          {
            mechanism: {
              type: "generic",
              data: { amount: 10n } as unknown as Record<string, string>,
            },
          },
        ],
      },
    } as ErrorEvent);

    expect(event.exception?.values?.[0]?.mechanism?.data?.amount).toBe("10");
  });

  it("caps strings, arrays and objects", () => {
    const longText = `${"a ".repeat(5000)}${JWT}`;
    const scrubbedText = scrubText(longText);
    expect(scrubbedText.length).toBeLessThan(8300);
    expect(scrubbedText.endsWith(TRUNCATED)).toBe(true);
    expect(scrubbedText).not.toContain("eyJ");

    const array = scrubRecord({
      list: Array.from({ length: 1000 }, (_, i) => i),
    }).list as unknown[];
    expect(array).toHaveLength(101);
    expect(array.at(-1)).toBe(`${TRUNCATED} 900 more`);

    const wide = Object.fromEntries(
      Array.from({ length: 500 }, (_, i) => [`k${i}`, i]),
    );
    const scrubbedWide = scrubRecord(wide);
    expect(Object.keys(scrubbedWide)).toHaveLength(101);
    expect(scrubbedWide[TRUNCATED]).toBe("400 more keys");
  });

  it("drops events, breadcrumbs and logs whose scrubbing throws", () => {
    expect(
      safeScrubEvent({
        type: undefined,
        contexts: { runtime: hostile() },
      } as ErrorEvent),
    ).toBeNull();
    expect(
      safeScrubBreadcrumb({ category: "fetch", data: hostile() }),
    ).toBeNull();
    expect(
      safeScrubLog({
        level: "error",
        message: "m",
        attributes: hostile(),
      } as Log),
    ).toBeNull();
  });

  it("strips a span whose scrubbing throws instead of sending it raw", () => {
    const span = safeScrubSpan({
      trace_id: "t",
      span_id: "s",
      name: "GET /mo?token=t",
      start_timestamp: 1,
      status: "ok",
      is_segment: true,
      attributes: hostile(),
    });

    expect(span.name).toBe(FILTERED);
    expect(span.attributes).toEqual({});
  });

  it("returns an explicit failure record if log redaction throws", () => {
    const info: Record<string, unknown> = {
      level: "error",
      label: "attacker-controlled hunter2",
      message: "hunter2",
    };
    Object.defineProperty(info, "error", {
      enumerable: true,
      get() {
        throw new Error("getter exploded");
      },
    });

    const result = redactLogInfo(info);

    expect(result).toEqual({
      level: "error",
      message: REDACTION_FAILED,
      [Symbol.for("level")]: "error",
    });
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });

  it("handles non-configurable, non-writable properties without mutating them", () => {
    const info: Record<string, unknown> = { level: "error" };
    for (const [key, value] of [
      ["message", `failed with ${JWT}`],
      ["label", FAKE_SECRETS.liveSecretKey],
      ["privateKey", PRIVATE_KEY],
      ["customField", "hunter2"],
    ]) {
      Object.defineProperty(info, key, {
        value,
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    Object.freeze(info);

    const result = redactLogInfo(info);
    const json = JSON.stringify(result);

    expect(json).not.toContain("eyJ");
    expect(json).not.toContain("sk_live");
    expect(json).not.toContain(PRIVATE_KEY);
    expect(json).not.toContain("hunter2");
    expect(info.message).toBe(`failed with ${JWT}`);
  });

  it("returns a failure record when a non-configurable allowlisted getter throws", () => {
    const info: Record<string, unknown> = { level: "warn" };
    Object.defineProperty(info, "stack", {
      enumerable: true,
      configurable: false,
      get() {
        throw new Error("getter exploded");
      },
    });
    Object.freeze(info);

    expect(redactLogInfo(info)).toEqual({
      level: "warn",
      message: REDACTION_FAILED,
      [Symbol.for("level")]: "warn",
    });
  });

  it("falls back to a stripped span built only from structural fields", () => {
    const span = safeScrubSpan({
      trace_id: "a".repeat(32),
      span_id: "b".repeat(16),
      parent_span_id: "c".repeat(16),
      name: "GET /mo?token=t",
      start_timestamp: 1,
      end_timestamp: 2,
      status: "ok",
      is_segment: true,
      attributes: hostile(),
      links: [
        { trace_id: "t", span_id: "s", attributes: { secret: "hunter2" } },
      ],
      unexpected: "hunter2",
    } as Parameters<typeof safeScrubSpan>[0]);

    expect(span).toEqual({
      trace_id: "a".repeat(32),
      span_id: "b".repeat(16),
      parent_span_id: "c".repeat(16),
      start_timestamp: 1,
      end_timestamp: 2,
      status: "ok",
      is_segment: true,
      name: FILTERED,
      attributes: {},
    });
    expect(JSON.stringify(span)).not.toContain("hunter2");
  });

  it("replaces malformed structural span fields in the fallback", () => {
    const span = safeScrubSpan({
      trace_id: 42,
      span_id: null,
      start_timestamp: "now",
      status: "weird",
      is_segment: "yes",
      name: "x",
      attributes: hostile(),
    } as unknown as Parameters<typeof safeScrubSpan>[0]);

    expect(span).toMatchObject({
      trace_id: "0".repeat(32),
      span_id: "0".repeat(16),
      start_timestamp: 0,
      status: "error",
      is_segment: false,
      name: FILTERED,
      attributes: {},
    });
  });

  it("redacts before truncating, so a credential on the boundary never leaks", () => {
    const secret = "abcdefghijklmnopqrstuvwxyz123456";

    for (let offset = -40; offset <= 5; offset += 1) {
      const padding = "a ".repeat(Math.floor((MAX_STRING_LENGTH + offset) / 2));
      const text = `${padding}Bearer ${secret} tail`;
      const result = scrubText(text);

      expect(result).not.toContain("abcdefgh");
      expect(result.length).toBeLessThanOrEqual(
        MAX_STRING_LENGTH + TRUNCATED.length + 1,
      );
    }
  });

  it("drops oversized input entirely instead of scanning part of it", () => {
    const text = `${JWT} ${"x".repeat(MAX_SCRUB_INPUT_LENGTH)}`;
    expect(scrubText(text)).toBe(TRUNCATED);
  });

  it("filters a private key under an unknown field and OAuth codes in encoded URLs", () => {
    expect(
      scrubRecord({
        mystery: PRIVATE_KEY,
        redirect:
          "/sign-in?redirect_url=%2Fcallback%3Fcode%3Dabc123%26state%3Dxyz",
        encoded: "next=%2Fcb%3Faccess_token%3Dabc123",
      }),
    ).toEqual({
      mystery: FILTERED,
      redirect: `/sign-in?${FILTERED}`,
      encoded: `next=%2Fcb%3F${FILTERED}`,
    });
  });

  it("scrubs the transaction name carried in the sampling context", () => {
    const dsc = { transaction: "GET /sso-callback?code=abc123", trace_id: "t" };
    scrubDynamicSamplingContext(dsc);
    expect(dsc).toEqual({
      transaction: `GET /sso-callback?${FILTERED}`,
      trace_id: "t",
    });
  });
});

describe("client-controlled headers", () => {
  it("never forwards request-id headers the client could have forged", () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        headers: {
          "x-request-id": "forged",
          "x-upstream-request-id": "forged",
          "user-agent": "UA",
        },
      },
    } as ErrorEvent);

    expect(event.request?.headers).toEqual({ "user-agent": "UA" });
  });

  it("drops span header attributes outside the allowlist", () => {
    const span = scrubSpan({
      trace_id: "t",
      span_id: "s",
      name: "GET /mo",
      start_timestamp: 1,
      status: "ok",
      is_segment: true,
      attributes: {
        "http.request.header.x-upstream-request-id": ["forged"],
        "http.request.header.x_request_id": ["forged"],
        "http.request.header.x-forwarded-for": ["1.2.3.4"],
        "http.request.header.user-agent": ["UA"],
        "http.request.header.accept_language": ["en"],
        "http.route": "/[username]",
      },
    });

    expect(span.attributes).toEqual({
      "http.request.header.user-agent": ["UA"],
      "http.request.header.accept_language": ["en"],
      "http.route": "/[username]",
    });
  });
});

describe("review round 5", () => {
  const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
  const SPAN = "00f067aa0ba902b7";

  const span = (overrides: Record<string, unknown> = {}) =>
    ({
      trace_id: TRACE,
      span_id: SPAN,
      parent_span_id: "a3ce929d0e0e4736",
      name: "GET /mo",
      start_timestamp: 1,
      end_timestamp: 2,
      status: "ok",
      is_segment: true,
      attributes: { "http.route": "/[username]" },
      ...overrides,
    }) as Parameters<typeof scrubSpan>[0];

  it("replaces unsupported object types instead of passing them through", () => {
    class PaymentIntent {
      secret = "hunter2";
      toJSON() {
        return { secret: this.secret };
      }
    }

    const result = scrubRecord({
      url: new URL("https://example.com/callback?token=secret123#frag"),
      when: new Date("2026-11-12T10:00:00.000Z"),
      badDate: new Date("nope"),
      map: new Map([["token", "secret123"]]),
      set: new Set(["secret123"]),
      buffer: Buffer.from("secret123"),
      bytes: new Uint8Array([1, 2, 3]),
      intent: new PaymentIntent(),
      fn: () => "secret123",
      sym: Symbol("secret123"),
      nullProto: Object.assign(Object.create(null), { ok: 1, token: "t" }),
      big: 10n,
    });

    expect(result).toEqual({
      url: `https://example.com/callback?${FILTERED}`,
      when: "2026-11-12T10:00:00.000Z",
      badDate: TRUNCATED,
      map: FILTERED,
      set: FILTERED,
      buffer: FILTERED,
      bytes: FILTERED,
      intent: FILTERED,
      fn: FILTERED,
      sym: FILTERED,
      nullProto: { ok: 1, token: FILTERED },
      big: "10",
    });
    expect(safeStringify(result)).not.toContain("secret123");
    expect(safeStringify(result)).not.toContain("hunter2");
  });

  it("treats __proto__ keys as data and never pollutes prototypes", () => {
    const input = JSON.parse(
      '{"__proto__": {"polluted": true}, "constructor": {"prototype": {"x": 1}}}',
    );
    const result = scrubRecord(input);

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.keys(result)).toEqual(["__proto__", "constructor"]);
    expect(JSON.parse(safeStringify(result))).toEqual(input);
  });

  it("does not expose unknown span fields on the success path", () => {
    const result = scrubSpan(
      span({
        unexpected: "hunter2",
        links: [
          {
            trace_id: TRACE,
            span_id: SPAN,
            sampled: true,
            attributes: { "http.request.header.cookie": "c", note: "token=x" },
            extra: "hunter2",
          },
        ],
      }),
    );

    expect(Object.keys(result).sort()).toEqual(
      [
        "attributes",
        "end_timestamp",
        "is_segment",
        "links",
        "name",
        "parent_span_id",
        "span_id",
        "start_timestamp",
        "status",
        "trace_id",
      ].sort(),
    );
    expect(result.links).toEqual([
      {
        trace_id: TRACE,
        span_id: SPAN,
        sampled: true,
        attributes: { note: `token=${FILTERED}` },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });

  it("omits optional span fields that were absent", () => {
    const result = scrubSpan(
      span({ parent_span_id: undefined, end_timestamp: undefined }),
    );

    expect("parent_span_id" in result).toBe(false);
    expect("end_timestamp" in result).toBe(false);
    expect("links" in result).toBe(false);
  });

  it("preserves valid trace identifiers in the fallback", () => {
    const result = safeScrubSpan(span({ attributes: hostileAttributes() }));

    expect(result.trace_id).toBe(TRACE);
    expect(result.span_id).toBe(SPAN);
    expect(result.parent_span_id).toBe("a3ce929d0e0e4736");
  });

  it.each([
    ["all zeros", "0".repeat(32), "0".repeat(16)],
    ["upper-case hex", TRACE.toUpperCase(), SPAN.toUpperCase()],
    ["wrong length", "abc", "def"],
    ["non-hex", "z".repeat(32), "z".repeat(16)],
  ])("rejects %s trace identifiers so Sentry discards the span", (_label, trace, spanId) => {
    const result = safeScrubSpan(
      span({
        trace_id: trace,
        span_id: spanId,
        parent_span_id: spanId,
        attributes: hostileAttributes(),
      }),
    );

    expect(result.trace_id).toBe(INVALID_TRACE_ID);
    expect(result.span_id).toBe(INVALID_SPAN_ID);
    expect(result.parent_span_id).toBeUndefined();
  });

  it("applies a specific policy to each allowlisted log field", () => {
    const LEVEL = Symbol.for("level");
    const good = redactLogInfo({
      level: "warn",
      message: `hi ${JWT}`,
      label: "app",
      service: "@4mica/playground",
      timestamp: "2026-11-12T10:00:00.000Z",
      requestId: "0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c",
      upstreamRequestId: "0f3a9c2b7e8d4f1a0b2c3d4e5f6a7b8c",
      method: "POST",
      path: "/mo?token=t",
      routePath: "/[username]",
      routeType: "render",
      digest: "2106429028",
      origin: "unhandledRejection",
    });

    expect(good).toEqual({
      level: "warn",
      message: `hi ${FILTERED}`,
      label: "app",
      service: "@4mica/playground",
      timestamp: "2026-11-12T10:00:00.000Z",
      requestId: "0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c",
      upstreamRequestId: "0f3a9c2b7e8d4f1a0b2c3d4e5f6a7b8c",
      method: "POST",
      path: NOT_ALLOWLISTED,
      routePath: "/[username]",
      routeType: "render",
      digest: "2106429028",
      origin: "unhandledRejection",
      [LEVEL]: "warn",
    });

    const bad = redactLogInfo({
      level: "verbose; drop table",
      label: "App Label With Spaces",
      service: "evil-service",
      timestamp: "yesterday at noon",
      requestId: "short",
      method: "TRACE",
      routeType: "anything",
      digest: "has spaces in it",
      origin: { requestBody: { paymentDetails: "sensitive information" } },
      message: { not: "a string" },
      routePath: 42,
    });

    expect(bad).toEqual({
      level: "error",
      label: FILTERED,
      service: FILTERED,
      timestamp: FILTERED,
      requestId: FILTERED,
      method: FILTERED,
      routeType: FILTERED,
      digest: FILTERED,
      origin: FILTERED,
      message: FILTERED,
      routePath: FILTERED,
      [LEVEL]: "error",
    });
  });

  it("keeps only name, message, stack and cause for the error field", () => {
    const result = redactLogInfo({
      level: "error",
      error: {
        name: "PaymentError",
        message: "declined for mo@example.com",
        stack: "at pay (/app/pay.js:1:1)",
        requestBody: { card: "4242424242424242" },
        cause: { message: `upstream ${JWT}`, headers: { authorization: "x" } },
      },
    });

    expect(result.error).toEqual({
      name: "PaymentError",
      message: `declined for ${FILTERED}`,
      stack: "at pay (/app/pay.js:1:1)",
      cause: { message: `upstream ${FILTERED}` },
    });
  });
});

function hostileAttributes() {
  const record: Record<string, unknown> = {};
  Object.defineProperty(record, "boom", {
    enumerable: true,
    get() {
      throw new Error("getter exploded");
    },
  });
  return record;
}

describe("review round 6", () => {
  it("rebuilds Sentry logs from the SDK's Log fields only", () => {
    const template = Object.assign(
      new String(`login for mo@example.com ${JWT}`),
      {
        __sentry_template_string__: "login for %s %s",
        __sentry_template_values__: ["mo@example.com", JWT],
      },
    );

    const log = scrubLog({
      level: "warn",
      message: template,
      severityNumber: 13,
      attributes: {
        "sentry.message.parameter.0": "mo@example.com",
        "http.response.header.x-internal-key": "abc123",
        requestId: "r",
      },
      customField: "hunter2",
      __sentry_template_values__: ["hunter2"],
    } as unknown as Log);

    expect(log).toEqual({
      level: "warn",
      message: `login for ${FILTERED} ${FILTERED}`,
      severityNumber: 13,
      attributes: {
        "sentry.message.parameter.0": FILTERED,
        requestId: "r",
      },
    });
    expect(typeof log.message).toBe("string");
    expect(JSON.stringify(log)).not.toContain("hunter2");
  });

  it("normalises unknown log levels and drops non-numeric severities", () => {
    expect(
      scrubLog({
        level: "critical",
        message: "m",
        severityNumber: Number.NaN,
      } as unknown as Log),
    ).toEqual({ level: "error", message: "m" });
  });

  it("blocks every response-header span attribute and unknown request headers", () => {
    const result = scrubSpan({
      trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
      span_id: "00f067aa0ba902b7",
      name: "GET /mo",
      start_timestamp: 1,
      status: "ok",
      is_segment: true,
      attributes: {
        "http.response.header.x-internal-key": "abc123",
        "http.response.header.content-type": "text/html",
        "HTTP.Response.Header.Set-Cookie": "a=b",
        "http.request.header.X-Internal-Key": "abc123",
        "http.request.header.User-Agent": "UA",
        "http.request.header.accept_language": "en",
        "http.response.status_code": 200,
      },
    });

    expect(result.attributes).toEqual({
      "http.request.header.User-Agent": "UA",
      "http.request.header.accept_language": "en",
      "http.response.status_code": 200,
    });
  });

  it("scrubs custom event fingerprints", () => {
    const event = scrubEvent({
      type: undefined,
      fingerprint: [
        "payment",
        "customer mo@example.com",
        JWT,
        "{{ default }}",
        42 as unknown as string,
      ],
    } as ErrorEvent);

    expect(event.fingerprint).toEqual([
      "payment",
      `customer ${FILTERED}`,
      FILTERED,
      "{{ default }}",
      FILTERED,
    ]);
  });

  it("configures every Sentry v11 data collection category explicitly", () => {
    expect(sentryOptions(0.1).dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: {
          allow: [
            "accept-language",
            "content-type",
            "host",
            "referer",
            "user-agent",
          ],
        },
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
    });
  });
});

describe("review round 7", () => {
  it("keeps finite numbers and replaces NaN and infinities", () => {
    expect(
      scrubRecord({
        amount: 1.5,
        zero: 0,
        negative: -3,
        notANumber: Number.NaN,
        up: Number.POSITIVE_INFINITY,
        down: Number.NEGATIVE_INFINITY,
        big: 12345678901234567890n,
      }),
    ).toEqual({
      amount: 1.5,
      zero: 0,
      negative: -3,
      notANumber: TRUNCATED,
      up: TRUNCATED,
      down: TRUNCATED,
      big: "12345678901234567890",
    });
  });

  it("never logs a raw request path, only the route template", () => {
    const result = redactLogInfo({
      level: "error",
      message: "request failed",
      path: "/reset/shortsecret123",
      routePath: "/reset/[token]",
    });

    expect(result.path).toBe(NOT_ALLOWLISTED);
    expect(result.routePath).toBe("/reset/[token]");
    expect(JSON.stringify(result)).not.toContain("shortsecret123");
  });

  it("drops scope user attributes from spans and logs", () => {
    const attributes = {
      "user.id": "user_2abc",
      "user.email": "mo@example.com",
      "user.ip_address": "203.0.113.7",
      "user.name": "Mo",
      "http.route": "/[username]",
    };
    const span = scrubSpan({
      trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
      span_id: "00f067aa0ba902b7",
      name: "GET /mo",
      start_timestamp: 1,
      status: "ok",
      is_segment: true,
      attributes,
    });
    const log = scrubLog({ level: "info", message: "m", attributes } as Log);

    expect(span.attributes).toEqual({ "http.route": "/[username]" });
    expect(log.attributes).toEqual({ "http.route": "/[username]" });
  });

  it("disables Sentry metrics entirely", () => {
    const options = sentryOptions(0.1);
    expect(options.beforeSendMetric()).toBeNull();
  });
});

describe("custom payload allowlists", () => {
  const payment = {
    cardHolder: "Ada Lovelace",
    amount: 4200,
    merchantRef: "ORDER-77-PRIVATE",
  };

  it("keeps only the SDK's own context names", () => {
    const event = scrubEvent({
      type: undefined,
      contexts: {
        trace: { trace_id: "t", span_id: "s" },
        nextjs: { route_type: "render" },
        runtime: { name: "node" },
        react: { version: "19" },
        payment,
        state: { state: { value: payment } },
      },
    } as unknown as ErrorEvent);

    expect(Object.keys(event.contexts ?? {}).sort()).toEqual([
      "nextjs",
      "react",
      "runtime",
      "trace",
    ]);
    expect(JSON.stringify(event)).not.toContain("Ada Lovelace");
  });

  it("keeps only request-id and SDK tags", () => {
    const event = scrubEvent({
      type: undefined,
      tags: {
        request_id: "0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c",
        upstream_request_id: "0f3a9c2b7e8d4f1a0b2c3d4e5f6a7b8c",
        turbopack: true,
        merchant_ref: "ORDER-77-PRIVATE",
        cardHolder: "Ada Lovelace",
      },
    } as unknown as ErrorEvent);

    expect(event.tags).toEqual({
      request_id: "0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c",
      upstream_request_id: "0f3a9c2b7e8d4f1a0b2c3d4e5f6a7b8c",
      turbopack: true,
    });
  });

  it("documents the allowlists", () => {
    expect([...ALLOWED_TAGS].sort()).toEqual([
      "request_id",
      "turbopack",
      "upstream_request_id",
    ]);
    expect(ALLOWED_CONTEXTS.has("state")).toBe(false);
  });

  it("tags a scope with only the request ids that are present", () => {
    const tags: Record<string, string> = {};
    const scope = {
      setTag: (key: string, value: string) => {
        tags[key] = value;
      },
    };

    tagRequest(scope, { requestId: "rid" });
    expect(tags).toEqual({ request_id: "rid" });

    tagRequest(scope, { requestId: "rid", upstreamRequestId: "up" });
    expect(tags).toEqual({ request_id: "rid", upstream_request_id: "up" });
  });
});

describe("absent log fields", () => {
  it("leaves undefined fields out instead of marking them filtered", () => {
    const result = redactLogInfo({
      level: "error",
      message: "request failed",
      requestId: "0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c",
      upstreamRequestId: undefined,
      digest: undefined,
    });

    expect(result).toEqual({
      level: "error",
      message: "request failed",
      requestId: "0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c",
      [Symbol.for("level")]: "error",
    });
    expect("upstreamRequestId" in result).toBe(false);
  });
});

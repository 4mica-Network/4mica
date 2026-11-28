import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectAddress } from "@/test-support/https-request";
import {
  deliver,
  MAX_IN_FLIGHT_PER_ORGANIZATION,
  signature,
  streamSecret,
  toAuditEvent,
} from "./delivery";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
const https = await vi.hoisted(async () =>
  (await import("@/test-support/https-request")).fakeHttps(),
);

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  return { ...actual, lookup, default: { ...actual, lookup } };
});

vi.mock("node:https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:https")>();
  return {
    ...actual,
    request: https.request,
    default: { ...actual, request: https.request },
  };
});

const KEY = "k".repeat(32);
const STREAM = {
  id: "019fce62-0000-7000-8000-0000000000aa",
  organizationId: "019fce62-0000-7000-8000-0000000000a1",
  url: "https://siem.example.com/ingest",
};
const NOW = new Date("2026-11-27T12:00:00Z");

const event = toAuditEvent({
  id: "019fce62-0000-7000-8000-000000000e01",
  organizationId: STREAM.organizationId,
  projectId: null,
  actorUserId: null,
  actorApiKeyId: null,
  action: "member.joined",
  targetType: "user",
  targetId: "u1",
  metadata: { role: "VIEWER" },
  ip: null,
  createdAt: NOW,
});

describe("audit stream delivery", () => {
  beforeEach(() => {
    https.reset();
    https.state.status = 204;
    lookup.mockReset();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("derives a stable secret per stream and version", () => {
    const secret = streamSecret(KEY, STREAM.id, 1);

    expect(secret).toBe(
      createHmac("sha256", KEY).update(`${STREAM.id}:1`).digest("base64url"),
    );
    expect(streamSecret(KEY, STREAM.id, 2)).not.toBe(secret);
  });

  it("signs t=<unix>,v1=<hex hmac of t.body> so a receiver can verify it", async () => {
    const secret = streamSecret(KEY, STREAM.id, 1);

    const result = await deliver(STREAM, secret, [event], () => NOW);

    expect(result).toMatchObject({ ok: true, statusCode: 204, error: null });
    const [sent] = https.requests;
    expect(sent?.options).toMatchObject({
      hostname: "siem.example.com",
      path: "/ingest",
      method: "POST",
    });
    const headers = sent?.headers as Record<string, string>;
    const body = sent?.body as string;
    expect(JSON.parse(body)).toEqual({
      stream: { id: STREAM.id, organizationId: STREAM.organizationId },
      events: [event],
    });
    expect(headers["x-4mica-delivery"]).toBe(result.deliveryId);

    const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(
      headers["x-4mica-signature"] as string,
    );
    expect(match).not.toBeNull();
    const [, t, v1] = match as RegExpExecArray;
    expect(Number(t)).toBe(NOW.getTime() / 1000);
    expect(v1).toBe(
      createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"),
    );
    expect(signature(secret, Number(t), body)).toBe(
      headers["x-4mica-signature"],
    );
  });

  it("refuses a host that resolves to a private address", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ]);

    const result = await deliver(STREAM, "s", [event]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("public address");
    expect(https.request).not.toHaveBeenCalled();
  });

  it.each([
    "127.0.0.1",
    "169.254.169.254",
    "::1",
    "fd00::1",
    "::ffff:10.0.0.1",
  ])("refuses %s", async (address) => {
    lookup.mockResolvedValue([
      { address, family: address.includes(":") ? 6 : 4 },
    ]);

    expect((await deliver(STREAM, "s", [event])).ok).toBe(false);
    expect(https.request).not.toHaveBeenCalled();
  });

  it("connects to the validated address even when DNS rebinds afterwards", async () => {
    lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    expect((await deliver(STREAM, "s", [event])).ok).toBe(true);

    const pinned = https.requests[0]?.options.lookup;
    if (!pinned) {
      throw new Error("the connection was not pinned");
    }
    expect(await connectAddress(pinned, "siem.example.com", true)).toEqual([
      { address: "93.184.216.34", family: 4 },
    ]);
    expect(lookup).toHaveBeenCalledOnce();
  });

  it("refuses a URL carrying credentials", async () => {
    const result = await deliver(
      { ...STREAM, url: "https://user:pass@siem.example.com/ingest" },
      "s",
      [event],
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("credentials");
    expect(https.request).not.toHaveBeenCalled();
  });

  it("refuses plain http", async () => {
    const result = await deliver(
      { ...STREAM, url: "http://siem.example.com/ingest" },
      "s",
      [event],
    );

    expect(result.ok).toBe(false);
    expect(https.request).not.toHaveBeenCalled();
  });

  it("does not follow redirects", async () => {
    https.state.status = 302;

    const result = await deliver(STREAM, "s", [event]);

    expect(result).toMatchObject({ ok: false, statusCode: 302 });
    expect(result.error).toContain("redirect");
    expect(https.request).toHaveBeenCalledOnce();
  });

  it("reports a non-2xx answer and a network error as failures", async () => {
    https.state.status = 500;
    expect(await deliver(STREAM, "s", [event])).toMatchObject({
      ok: false,
      statusCode: 500,
    });

    https.state.error = new Error("ECONNREFUSED");
    expect(await deliver(STREAM, "s", [event])).toMatchObject({
      ok: false,
      statusCode: null,
    });
  });

  it("caps concurrent deliveries per organization and defers the rest", async () => {
    https.state.status = null;
    const stalled = Array.from({ length: MAX_IN_FLIGHT_PER_ORGANIZATION }, () =>
      deliver(STREAM, "s", [event]),
    );
    await vi.waitFor(() =>
      expect(https.request).toHaveBeenCalledTimes(
        MAX_IN_FLIGHT_PER_ORGANIZATION,
      ),
    );

    expect(await deliver(STREAM, "s", [event])).toMatchObject({
      ok: false,
      deferred: true,
    });
    expect(https.request).toHaveBeenCalledTimes(MAX_IN_FLIGHT_PER_ORGANIZATION);

    https.state.status = 204;
    expect(
      await deliver(
        { ...STREAM, organizationId: "019fce62-0000-7000-8000-0000000000b2" },
        "s",
        [event],
      ),
    ).toMatchObject({ ok: true });

    const caller = new AbortController();
    caller.abort();
    expect(
      await deliver(STREAM, "s", [event], () => NOW, caller.signal),
    ).toMatchObject({ ok: false, deferred: true });

    for (const { value } of https.request.mock.results.slice(
      0,
      MAX_IN_FLIGHT_PER_ORGANIZATION,
    )) {
      value.destroy(new Error("ECONNRESET"));
    }
    await Promise.all(stalled);

    expect(await deliver(STREAM, "s", [event])).toMatchObject({ ok: true });
  });

  it("names DNS when the deadline expires during resolution", async () => {
    vi.useFakeTimers();
    try {
      lookup.mockImplementation(() => new Promise(() => undefined));
      const pending = deliver(STREAM, "s", [event]);
      await vi.advanceTimersByTimeAsync(10_000);

      expect(await pending).toMatchObject({
        ok: false,
        error: "The endpoint's DNS did not resolve within 10s.",
      });
      expect(https.request).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

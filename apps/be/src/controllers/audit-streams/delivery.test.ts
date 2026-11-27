import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliver, signature, streamSecret, toAuditEvent } from "./delivery";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  return { ...actual, lookup, default: { ...actual, lookup } };
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

const fetchMock = vi.fn();

describe("audit stream delivery", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    lookup.mockReset();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe(STREAM.url);
    expect(init.redirect).toBe("manual");
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
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
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses plain http", async () => {
    const result = await deliver(
      { ...STREAM, url: "http://siem.example.com/ingest" },
      "s",
      [event],
    );

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not follow redirects", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/" },
      }),
    );

    const result = await deliver(STREAM, "s", [event]);

    expect(result).toMatchObject({ ok: false, statusCode: 302 });
    expect(result.error).toContain("redirect");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reports a non-2xx answer and a network error as failures", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 500 }));
    expect(await deliver(STREAM, "s", [event])).toMatchObject({
      ok: false,
      statusCode: 500,
    });

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await deliver(STREAM, "s", [event])).toMatchObject({
      ok: false,
      statusCode: null,
    });
  });
});

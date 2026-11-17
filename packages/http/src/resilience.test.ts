import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient, type HttpError, HttpMethod } from "./client";
import {
  backoffDelay,
  HttpTimeoutError,
  linkSignals,
  retryAfterMs,
} from "./resilience";

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const neverResolves = (_url: unknown, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const fail = () => reject(new DOMException("aborted", "AbortError"));
    if (init.signal?.aborted) {
      fail();
      return;
    }
    init.signal?.addEventListener("abort", fail);
  });

describe("backoffDelay", () => {
  const policy = { retries: 5, baseDelayMs: 100, maxDelayMs: 1000 };

  it("grows exponentially and is capped", () => {
    const full = () => 1;
    expect(backoffDelay(0, policy, full)).toBe(100);
    expect(backoffDelay(2, policy, full)).toBe(400);
    expect(backoffDelay(10, policy, full)).toBe(1000);
  });

  it("applies full jitter", () => {
    expect(backoffDelay(3, policy, () => 0)).toBe(0);
    expect(backoffDelay(3, policy, () => 0.5)).toBe(400);
  });
});

describe("retryAfterMs", () => {
  it("reads seconds and HTTP dates", () => {
    expect(retryAfterMs("3")).toBe(3000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
  });

  it("ignores missing or malformed values", () => {
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs("soon")).toBeNull();
  });
});

describe("linkSignals", () => {
  it("aborts when any source aborts and forwards the reason", () => {
    const a = new AbortController();
    const b = new AbortController();
    const { signal } = linkSignals(a.signal, b.signal);

    b.abort("gone");

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("gone");
  });

  it("starts aborted when a source already is", () => {
    const a = new AbortController();
    a.abort();
    expect(linkSignals(a.signal).signal.aborted).toBe(true);
  });
});

describe("HttpClient resilience", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const policy = { retries: 2, baseDelayMs: 1, maxDelayMs: 5 };

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a GET after a transient 503 and returns the later result", async () => {
    const client = new HttpClient("http://api.test/", { retry: policy });
    fetchMock
      .mockResolvedValueOnce(json({ error: "busy" }, 503))
      .mockResolvedValueOnce(json({ ok: true }));

    await expect(client.get("/me")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a GET after a network failure", async () => {
    const client = new HttpClient("http://api.test/", { retry: policy });
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ ok: true }));

    await expect(client.get("/me")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured number of retries", async () => {
    const client = new HttpClient("http://api.test/", { retry: policy });
    fetchMock.mockImplementation(async () => json({ error: "busy" }, 502));

    const error = await client.get("/me").catch((e: unknown) => e);

    expect((error as HttpError).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    400, 401, 403, 404, 409, 422, 500,
  ])("does not retry a %s", async (status) => {
    const client = new HttpClient("http://api.test/", { retry: policy });
    fetchMock.mockImplementation(async () => json({}, status));

    await client.get("/me").catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    HttpMethod.POST,
    HttpMethod.PUT,
    HttpMethod.PATCH,
    HttpMethod.DELETE,
  ])("never retries a %s, even on a transient failure", async (method) => {
    const client = new HttpClient("http://api.test/", { retry: policy });
    fetchMock.mockImplementation(async () => json({}, 503));

    await client.request({ url: "/me", method }).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honours Retry-After within the cap and gives up beyond it", async () => {
    vi.useFakeTimers();
    const client = new HttpClient("http://api.test/", {
      retry: { retries: 2, baseDelayMs: 1, maxDelayMs: 2_000 },
    });
    fetchMock
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "1" }))
      .mockResolvedValueOnce(json({ ok: true }));

    const pending = client.get("/me");
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: true });

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(json({}, 429, { "retry-after": "60" }));
    const error = await client.get("/me").catch((e: unknown) => e);
    expect((error as HttpError).retryAfterMs).toBe(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out a hung request with HttpTimeoutError", async () => {
    vi.useFakeTimers();
    const client = new HttpClient("http://api.test/", {
      timeoutMs: 1_000,
      retry: false,
    });
    fetchMock.mockImplementation(neverResolves);

    const pending = client.get("/me").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);

    const error = await pending;
    expect(error).toBeInstanceOf(HttpTimeoutError);
  });

  it("stops at once when the caller aborts, without retrying", async () => {
    const client = new HttpClient("http://api.test/", { retry: policy });
    fetchMock.mockImplementation(neverResolves);
    const controller = new AbortController();

    const pending = client
      .get("/me", { signal: controller.signal })
      .catch((e: unknown) => e);
    controller.abort();

    expect(((await pending) as Error).name).toBe("AbortError");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops waiting between retries when the caller aborts", async () => {
    vi.useFakeTimers();
    const client = new HttpClient("http://api.test/", {
      retry: { retries: 2, baseDelayMs: 10_000, maxDelayMs: 10_000 },
    });
    vi.spyOn(Math, "random").mockReturnValue(1);
    fetchMock.mockImplementation(async () => json({}, 503));
    const controller = new AbortController();

    const pending = client
      .get("/me", { signal: controller.signal })
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();

    expect(((await pending) as Error).name).toBe("AbortError");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

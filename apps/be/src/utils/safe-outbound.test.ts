import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectAddress } from "@/test-support/https-request";
import {
  OutboundAbortedError,
  OutboundTimeoutError,
  postToPublicUrl,
  UnsafeDestinationError,
} from "./safe-outbound";

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

const POST = { headers: {}, body: "{}", timeoutMs: 1_000 };
const PUBLIC = { address: "93.184.216.34", family: 4 };

describe("postToPublicUrl", () => {
  beforeEach(() => {
    https.reset();
    lookup.mockReset();
    lookup.mockResolvedValue([PUBLIC]);
  });

  it("connects only to the address it validated, even if DNS later rebinds", async () => {
    lookup
      .mockResolvedValueOnce([PUBLIC])
      .mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    expect(
      await postToPublicUrl("https://rebind.example.com/hook", POST),
    ).toEqual({ status: 200 });

    const [sent] = https.requests;
    expect(sent?.options).toMatchObject({
      hostname: "rebind.example.com",
      servername: "rebind.example.com",
      method: "POST",
      agent: false,
    });
    const lookupFn = sent?.options.lookup;
    if (!lookupFn) {
      throw new Error("no lookup was pinned");
    }
    expect(await connectAddress(lookupFn, "rebind.example.com", true)).toEqual([
      PUBLIC,
    ]);
    expect(await connectAddress(lookupFn, "rebind.example.com", false)).toEqual(
      [PUBLIC],
    );
    expect(lookup).toHaveBeenCalledOnce();
  });

  it("never connects when the host first resolves to a private address", async () => {
    lookup.mockResolvedValueOnce([{ address: "10.0.0.7", family: 4 }]);

    await expect(
      postToPublicUrl("https://rebind.example.com/hook", POST),
    ).rejects.toBeInstanceOf(UnsafeDestinationError);
    expect(https.request).not.toHaveBeenCalled();
  });

  it("refuses a mix of public and private answers", async () => {
    lookup.mockResolvedValue([
      PUBLIC,
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "fd00::7", family: 6 },
    ]);

    await expect(
      postToPublicUrl("https://mixed.example.com/hook", POST),
    ).rejects.toThrow("public address");
    expect(https.request).not.toHaveBeenCalled();
  });

  it.each([
    ["::1", 6],
    ["fe80::1", 6],
    ["fd00::1", 6],
    ["fc00::1", 6],
    ["::ffff:10.0.0.1", 6],
    ["::ffff:169.254.169.254", 6],
    ["::ffff:127.0.0.1", 6],
    ["64:ff9b::a9fe:a9fe", 6],
    ["0.1.2.3", 4],
    ["100.64.0.1", 4],
    ["127.0.0.1", 4],
    ["169.254.169.254", 4],
    ["172.16.0.1", 4],
    ["192.168.1.1", 4],
    ["198.18.0.1", 4],
  ])("refuses a host resolving to %s", async (address, family) => {
    lookup.mockResolvedValue([{ address, family }]);

    await expect(
      postToPublicUrl("https://hook.example.com/", POST),
    ).rejects.toBeInstanceOf(UnsafeDestinationError);
    expect(https.request).not.toHaveBeenCalled();
  });

  it("refuses a host that does not resolve", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));

    await expect(
      postToPublicUrl("https://gone.example.com/", POST),
    ).rejects.toBeInstanceOf(UnsafeDestinationError);
  });

  it.each([
    ["https://user:pass@hook.example.com/", "credentials"],
    ["https://token@hook.example.com/", "credentials"],
    ["http://hook.example.com/", "https"],
    ["https://169.254.169.254/", "public host"],
    ["https://[fd00::1]/", "public host"],
    ["https://localhost/", "public host"],
    ["not a url", "not valid"],
  ])("refuses %s without resolving it", async (url, message) => {
    await expect(postToPublicUrl(url, POST)).rejects.toThrow(message);
    expect(lookup).not.toHaveBeenCalled();
    expect(https.request).not.toHaveBeenCalled();
  });

  it("keeps a non-default https port and the query string", async () => {
    await postToPublicUrl("https://hook.example.com:8443/in?x=1", POST);

    expect(https.requests[0]?.options).toMatchObject({
      port: "8443",
      path: "/in?x=1",
    });
  });

  describe("one absolute deadline", () => {
    const never = () => new Promise<never>(() => undefined);
    const later = (ms: number) =>
      new Promise((resolve) => setTimeout(() => resolve([PUBLIC]), ms));

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("abandons a DNS lookup that never answers", async () => {
      lookup.mockImplementation(never);

      const pending = postToPublicUrl("https://dns-stall.example.com/", POST);
      const settled = expect(pending).rejects.toMatchObject({
        name: "TimeoutError",
        phase: "dns",
      });
      await vi.advanceTimersByTimeAsync(POST.timeoutMs);
      await settled;
      expect(https.request).not.toHaveBeenCalled();
    });

    it("never connects when DNS answers only after the deadline", async () => {
      lookup.mockImplementation(() => later(POST.timeoutMs * 3));

      const pending = postToPublicUrl("https://dns-slow.example.com/", POST);
      const settled =
        expect(pending).rejects.toBeInstanceOf(OutboundTimeoutError);
      await vi.advanceTimersByTimeAsync(POST.timeoutMs);
      await settled;
      await vi.advanceTimersByTimeAsync(POST.timeoutMs * 3);
      expect(https.request).not.toHaveBeenCalled();
    });

    it("counts DNS time against the connect, TLS and header budget", async () => {
      lookup.mockImplementation(() => later(POST.timeoutMs * 0.75));
      https.state.status = null;
      let failure: unknown = null;

      postToPublicUrl("https://connect-stall.example.com/", POST).catch(
        (error: unknown) => {
          failure = error;
        },
      );
      await vi.advanceTimersByTimeAsync(POST.timeoutMs);

      expect(https.request).toHaveBeenCalledOnce();
      expect(failure).toBeInstanceOf(OutboundTimeoutError);
      expect(failure).toMatchObject({ phase: "request" });
    });

    it("stops resolving as soon as the caller cancels", async () => {
      lookup.mockImplementation(never);
      const caller = new AbortController();

      const pending = postToPublicUrl("https://dns-stall.example.com/", {
        ...POST,
        signal: caller.signal,
      });
      caller.abort();

      await expect(pending).rejects.toBeInstanceOf(OutboundAbortedError);
      expect(https.request).not.toHaveBeenCalled();
    });

    it("destroys an in-flight request when the caller cancels", async () => {
      https.state.status = null;
      const caller = new AbortController();

      const pending = postToPublicUrl("https://connect-stall.example.com/", {
        ...POST,
        signal: caller.signal,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(https.request).toHaveBeenCalledOnce();
      caller.abort();

      await expect(pending).rejects.toBeInstanceOf(OutboundAbortedError);
    });

    it("does nothing for a caller that has already cancelled", async () => {
      const caller = new AbortController();
      caller.abort();

      await expect(
        postToPublicUrl("https://hook.example.com/", {
          ...POST,
          signal: caller.signal,
        }),
      ).rejects.toBeInstanceOf(OutboundAbortedError);
      expect(lookup).not.toHaveBeenCalled();
      expect(https.request).not.toHaveBeenCalled();
    });
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    https.state.status = null;
    try {
      const pending = postToPublicUrl("https://slow.example.com/", POST);
      const settled =
        expect(pending).rejects.toBeInstanceOf(OutboundTimeoutError);
      await vi.advanceTimersByTimeAsync(POST.timeoutMs);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});

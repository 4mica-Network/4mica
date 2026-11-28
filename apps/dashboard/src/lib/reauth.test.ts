import { HttpError } from "@4mica/http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notify", () => ({
  notifyInfo: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

const {
  ReauthCancelledError,
  ReauthUnavailableError,
  needsReauth,
  setReverifier,
  withReauth,
} = await import("./reauth");
const { httpClient } = await import("@api/client");
const { toMessage } = await import("@utils/http-errors");
const { HttpMethod } = await import("@4mica/http");

const reauthRequired = () =>
  new HttpError(403, "Forbidden", {
    error: "reauth_required",
    message: "Confirm your identity.",
    reauthWithinMinutes: 15,
  });

describe("withReauth", () => {
  afterEach(() => setReverifier(null));

  it("recognises only a 403 reauth_required", () => {
    expect(needsReauth(reauthRequired())).toBe(true);
    expect(needsReauth(new HttpError(403, "Forbidden", { error: "x" }))).toBe(
      false,
    );
    expect(needsReauth(new Error("nope"))).toBe(false);
  });

  it("passes other results and errors straight through", async () => {
    const reverify = vi.fn();
    setReverifier(reverify);
    await expect(withReauth(async () => 42)).resolves.toBe(42);
    const other = new HttpError(500, "Boom", null);
    await expect(
      withReauth(async () => {
        throw other;
      }),
    ).rejects.toBe(other);
    expect(reverify).not.toHaveBeenCalled();
  });

  it("asks the user to verify, then retries the request exactly once", async () => {
    const reverify = vi.fn(async () => true);
    setReverifier(reverify);
    const send = vi
      .fn()
      .mockRejectedValueOnce(reauthRequired())
      .mockResolvedValueOnce("done");

    await expect(withReauth(send)).resolves.toBe("done");
    expect(reverify).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does not loop when the retry is refused again", async () => {
    const reverify = vi.fn(async () => true);
    setReverifier(reverify);
    const send = vi.fn().mockRejectedValue(reauthRequired());

    await expect(withReauth(send)).rejects.toBeInstanceOf(HttpError);
    expect(send).toHaveBeenCalledTimes(2);
    expect(reverify).toHaveBeenCalledTimes(1);
  });

  it("stops without retrying when the user cancels", async () => {
    setReverifier(async () => false);
    const send = vi.fn().mockRejectedValue(reauthRequired());

    const error = await withReauth(send).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReauthCancelledError);
    expect(send).toHaveBeenCalledTimes(1);
    expect(toMessage(error, "fallback")).toBe(
      "Verification was cancelled, so nothing was changed.",
    );
  });

  it("asks the user to sign in again when verification is unavailable", async () => {
    const send = vi.fn().mockRejectedValue(reauthRequired());
    const unset = await withReauth(send).catch((e: unknown) => e);
    expect(unset).toBeInstanceOf(ReauthUnavailableError);

    setReverifier(async () => {
      throw new Error("modal failed");
    });
    const broken = await withReauth(send).catch((e: unknown) => e);
    expect(broken).toBeInstanceOf(ReauthUnavailableError);
    expect(toMessage(broken, "fallback")).toContain("sign in again");
  });

  it("shows one prompt for requests refused at the same time", async () => {
    let finish: (value: boolean) => void = () => {};
    const reverify = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    setReverifier(reverify);
    const sendA = vi
      .fn()
      .mockRejectedValueOnce(reauthRequired())
      .mockResolvedValue("a");
    const sendB = vi
      .fn()
      .mockRejectedValueOnce(reauthRequired())
      .mockResolvedValue("b");

    const both = Promise.all([withReauth(sendA), withReauth(sendB)]);
    await vi.waitFor(() => expect(reverify).toHaveBeenCalled());
    finish(true);

    await expect(both).resolves.toEqual(["a", "b"]);
    expect(reverify).toHaveBeenCalledTimes(1);
  });
});

describe("the API client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    setReverifier(null);
    vi.unstubAllGlobals();
  });

  it("re-sends a request the API refused for a stale sign-in once the user verifies", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "reauth_required", message: "Confirm" }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ requireMfa: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const reverify = vi.fn(async () => true);
    setReverifier(reverify);

    await expect(
      httpClient.request({
        url: "/me/organization/security",
        method: HttpMethod.PUT,
        data: { requireMfa: true },
      }),
    ).resolves.toEqual({ requireMfa: true });
    expect(reverify).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(
      JSON.stringify({ requireMfa: true }),
    );
  });
});

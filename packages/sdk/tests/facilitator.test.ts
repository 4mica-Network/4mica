import { describe, expect, it } from "vitest";
import { Facilitator, neverArrived } from "@/client/facilitator";
import { OutcomeUnknownError, SponsorshipTransportError } from "@/errors";
import type { FetchFn } from "@/rpc";

/** Node's `fetch` (undici) wraps system errors as the cause of a TypeError. */
function fetchFailed(code: string): Error {
  const cause = Object.assign(new Error(code), { code });
  return new TypeError("fetch failed", { cause });
}

function rejecting(err: unknown): FetchFn {
  return async () => {
    throw err;
  };
}

describe("Facilitator transport classification", () => {
  it("treats a refused connection as never having arrived", async () => {
    const facilitator = new Facilitator(
      "https://facilitator.example",
      rejecting(fetchFailed("ECONNREFUSED")),
    );
    await expect(facilitator.post("deposit", {})).rejects.toBeInstanceOf(
      SponsorshipTransportError,
    );
  });

  it("treats DNS failures and unparseable URLs as never having arrived", () => {
    expect(neverArrived(fetchFailed("ENOTFOUND"))).toBe(true);
    expect(neverArrived(fetchFailed("EAI_AGAIN"))).toBe(true);
    expect(neverArrived(fetchFailed("UND_ERR_CONNECT_TIMEOUT"))).toBe(true);
    expect(neverArrived(fetchFailed("ERR_TLS_CERT_ALTNAME_INVALID"))).toBe(
      true,
    );
    expect(
      neverArrived(
        Object.assign(new TypeError("Invalid URL"), {
          code: "ERR_INVALID_URL",
        }),
      ),
    ).toBe(true);
  });

  it("treats an abort as an unknown outcome — the request may have gone out", async () => {
    const abort = Object.assign(new Error("This operation was aborted"), {
      name: "AbortError",
    });
    const facilitator = new Facilitator(
      "https://facilitator.example",
      rejecting(abort),
    );
    await expect(facilitator.post("withdraw", {})).rejects.toBeInstanceOf(
      OutcomeUnknownError,
    );
  });

  it("treats resets, timeouts and opaque failures as unknown outcomes", () => {
    expect(neverArrived(fetchFailed("ECONNRESET"))).toBe(false);
    expect(neverArrived(fetchFailed("UND_ERR_HEADERS_TIMEOUT"))).toBe(false);
    expect(neverArrived(fetchFailed("UND_ERR_SOCKET"))).toBe(false);
    // A browser's bare `TypeError: Failed to fetch` carries no code.
    expect(neverArrived(new TypeError("Failed to fetch"))).toBe(false);
    expect(neverArrived("boom")).toBe(false);
  });

  it("invokes fetch as a free function, not as a method of the client", async () => {
    let receiver: unknown = "unset";
    const fetchFn = async function (this: unknown) {
      receiver = this;
      return new Response(JSON.stringify({ success: true, txHash: "0x1" }), {
        status: 200,
      });
    } as unknown as FetchFn;
    const facilitator = new Facilitator("https://facilitator.example", fetchFn);
    await facilitator.post("deposit", {});
    expect(receiver).toBeUndefined();
  });
});

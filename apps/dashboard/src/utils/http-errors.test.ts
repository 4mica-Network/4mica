import { HttpError } from "@4mica/http";
import { describe, expect, it } from "vitest";
import { toIssueMap, toMessage } from "./http-errors";

const httpError = (status: number, body: unknown) =>
  new HttpError(status, "error", body);

describe("toIssueMap", () => {
  it("maps nested and indexed paths onto the field that renders them", () => {
    const map = toIssueMap(
      httpError(400, {
        issues: [
          { path: "identities.0.address", message: "bad address" },
          { path: "events.2", message: "unknown event" },
          { path: "name", message: "too long" },
        ],
      }),
    );

    expect(map).toMatchObject({
      "identities.0.address": "bad address",
      address: "bad address",
      identities: "bad address",
      events: "unknown event",
      name: "too long",
    });
  });

  it("ignores malformed bodies and non-HTTP errors", () => {
    expect(toIssueMap(httpError(400, { issues: "nope" }))).toEqual({});
    expect(toIssueMap(httpError(400, null))).toEqual({});
    expect(toIssueMap(new Error("boom"))).toEqual({});
  });
});

describe("toMessage", () => {
  it("names the first failing field instead of the generic envelope text", () => {
    expect(
      toMessage(
        httpError(400, {
          error: "invalid_request",
          message: "The request body failed validation.",
          issues: [{ path: "url", message: "must be an https URL" }],
        }),
        "fallback",
      ),
    ).toBe("url: must be an https URL");
  });

  it("keeps a specific server message even when issues are attached", () => {
    expect(
      toMessage(
        httpError(400, {
          error: "wallet_inactive",
          message: "A paused wallet cannot receive payments.",
          issues: [{ path: "walletId", message: "must be an active wallet" }],
        }),
        "fallback",
      ),
    ).toBe("A paused wallet cannot receive payments.");
  });

  it("uses the session message for auth failures when given one", () => {
    expect(
      toMessage(httpError(401, { message: "x" }), "fallback", {
        sessionExpired: "Sign in again",
      }),
    ).toBe("Sign in again");
  });

  it("falls back when the server gives nothing usable", () => {
    expect(toMessage(httpError(500, null), "fallback")).toBe("fallback");
    expect(toMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});

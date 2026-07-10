import { describe, expect, it } from "vitest";
import { extractErrorMessage, normalizeBaseUrl, requestJson } from "@/http";

describe("http helpers", () => {
  it("normalizeBaseUrl trims trailing slash", () => {
    expect(normalizeBaseUrl("https://example.com/")).toBe(
      "https://example.com",
    );
  });

  it("extractErrorMessage prefers error/message", () => {
    expect(extractErrorMessage({ error: "nope" })).toBe("nope");
    expect(extractErrorMessage({ message: "bad" })).toBe("bad");
  });

  it("requestJson throws on invalid json", async () => {
    const fetch = async () => new Response("not-json", { status: 200 });
    await expect(
      requestJson(
        fetch,
        "https://example.com",
        { method: "GET" },
        {
          decodeError: (message) => new Error(message),
          httpError: (message) => new Error(message),
        },
      ),
    ).rejects.toThrow("invalid JSON response");
  });

  it("requestJson allows empty responses when configured", async () => {
    const fetch = async () => new Response("", { status: 200 });
    const payload = await requestJson(
      fetch,
      "https://example.com",
      { method: "GET" },
      {
        decodeError: (message) => new Error(message),
        httpError: (message) => new Error(message),
        allowEmptyOk: true,
      },
    );
    expect(payload).toBe(null);
  });
});

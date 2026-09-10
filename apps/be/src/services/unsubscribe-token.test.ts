import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "a".repeat(48);

const importSubject = async () => {
  vi.resetModules();

  return import("./unsubscribe-token");
};

describe("unsubscribe tokens", () => {
  beforeEach(() => {
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
    vi.stubEnv("UNSUBSCRIBE_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("round-trips a user id", async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } =
      await importSubject();

    const token = signUnsubscribeToken("user-1");

    expect(token).toMatch(/^v1\./);
    expect(verifyUnsubscribeToken(token as string)).toBe("user-1");
  });

  it("rejects a token whose payload was swapped for another user", async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } =
      await importSubject();

    const token = signUnsubscribeToken("user-1") as string;
    const [version, , signature] = token.split(".");
    const forged = [
      version,
      Buffer.from("user-2").toString("base64url"),
      signature,
    ].join(".");

    expect(verifyUnsubscribeToken(forged)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } =
      await importSubject();

    const token = signUnsubscribeToken("user-1") as string;
    const [version, payload] = token.split(".");

    expect(
      verifyUnsubscribeToken(`${version}.${payload}.${"b".repeat(43)}`),
    ).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const first = await importSubject();
    const token = first.signUnsubscribeToken("user-1") as string;

    vi.stubEnv("UNSUBSCRIBE_SECRET", "z".repeat(48));
    const second = await importSubject();

    expect(second.verifyUnsubscribeToken(token)).toBeNull();
  });

  it("rejects an unknown version prefix", async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } =
      await importSubject();

    const token = signUnsubscribeToken("user-1") as string;

    expect(verifyUnsubscribeToken(token.replace(/^v1\./, "v2."))).toBeNull();
  });

  it("returns null rather than throwing on malformed input", async () => {
    const { verifyUnsubscribeToken } = await importSubject();

    for (const bad of ["", "nope", "v1.", "v1.a", "a.b.c.d"]) {
      expect(verifyUnsubscribeToken(bad)).toBeNull();
    }
  });

  it("builds an absolute URL carrying the token in the query string", async () => {
    const { unsubscribeUrlFor, verifyUnsubscribeToken } = await importSubject();

    const url = new URL(unsubscribeUrlFor("user-1") as string);

    expect(url.pathname).toBe("/unsubscribe");
    expect(
      verifyUnsubscribeToken(url.searchParams.get("token") as string),
    ).toBe("user-1");
  });

  it("mints nothing when no secret is configured", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    const { signUnsubscribeToken, unsubscribeUrlFor } = await importSubject();

    expect(signUnsubscribeToken("user-1")).toBeNull();
    expect(unsubscribeUrlFor("user-1")).toBeNull();
  });
});

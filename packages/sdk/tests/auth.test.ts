import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { AuthClient, AuthSession, buildSiweMessage } from "@/auth";
import {
  AuthApiError,
  AuthConfigError,
  AuthDecodeError,
  AuthTransportError,
} from "@/errors";
import type { FetchFn } from "@/rpc";

const PRIVATE_KEY =
  "0x59c6995e998f97a5a0044976f7be35d5ad91c0cfa55b5cfb20b07a1c60f4c5bc";

const noncePayload = {
  nonce: "nonce-123",
  siwe: {
    domain: "example.com",
    uri: "https://example.com/login",
    chain_id: 1,
    statement: "Sign in",
    expiration: "2024-01-01T00:00:00Z",
    issued_at: "2024-01-01T00:00:00Z",
  },
};

describe("buildSiweMessage", () => {
  it("formats message for signing", () => {
    const message = buildSiweMessage({
      domain: "example.com",
      address: "0xabc",
      statement: "Sign in",
      uri: "https://example.com",
      chainId: 1,
      nonce: "nonce",
      issuedAt: "2024-01-01T00:00:00Z",
      expiration: "2024-01-02T00:00:00Z",
    });
    expect(message).toBe(
      [
        "example.com wants you to sign in with your Ethereum account:",
        "0xabc",
        "",
        "Sign in",
        "",
        "URI: https://example.com",
        "Version: 1",
        "Chain ID: 1",
        "Nonce: nonce",
        "Issued At: 2024-01-01T00:00:00Z",
        "Expiration Time: 2024-01-02T00:00:00Z",
      ].join("\n"),
    );
  });
});

describe("AuthClient", () => {
  it("parses siwe templates in snake_case and camelCase", async () => {
    const snakeFetch = vi.fn<FetchFn>(async () => {
      return new Response(JSON.stringify(noncePayload), { status: 200 });
    });
    const snakeClient = new AuthClient("https://auth.example.com", snakeFetch);
    const snake = await snakeClient.getNonce("0x123");
    expect(snake.siwe.chainId).toBe(1);
    expect(snake.siwe.issuedAt).toBe("2024-01-01T00:00:00Z");

    const camelFetch = vi.fn<FetchFn>(async () => {
      return new Response(
        JSON.stringify({
          nonce: "nonce-456",
          siwe: {
            domain: "example.com",
            uri: "https://example.com/login",
            chainId: 5,
            statement: "Sign in",
            expiration: "2024-02-01T00:00:00Z",
            issuedAt: "2024-02-01T00:00:00Z",
          },
        }),
        { status: 200 },
      );
    });
    const camelClient = new AuthClient("https://auth.example.com", camelFetch);
    const camel = await camelClient.getNonce("0x123");
    expect(camel.siwe.chainId).toBe(5);
    expect(camel.siwe.issuedAt).toBe("2024-02-01T00:00:00Z");
  });

  it("throws on invalid JSON responses", async () => {
    const fetchMock = vi.fn<FetchFn>(
      async () => new Response("not-json", { status: 200 }),
    );
    const client = new AuthClient("https://auth.example.com", fetchMock);
    await expect(client.getNonce("0x123")).rejects.toThrow(AuthDecodeError);
  });

  it("surfaces non-2xx errors with json bodies", async () => {
    const fetchMock = vi.fn<FetchFn>(async () => {
      return new Response(JSON.stringify({ error: "nope" }), { status: 401 });
    });
    const client = new AuthClient("https://auth.example.com", fetchMock);
    await expect(client.getNonce("0x123")).rejects.toThrow(AuthApiError);
  });

  it("surfaces non-2xx errors with text bodies", async () => {
    const fetchMock = vi.fn<FetchFn>(
      async () => new Response("nope", { status: 500 }),
    );
    const client = new AuthClient("https://auth.example.com", fetchMock);
    await expect(client.getNonce("0x123")).rejects.toThrow(AuthApiError);
  });

  it("wraps transport errors", async () => {
    const fetchMock = vi.fn<FetchFn>(async () => {
      throw new Error("boom");
    });
    const client = new AuthClient("https://auth.example.com", fetchMock);
    await expect(client.getNonce("0x123")).rejects.toThrow(AuthTransportError);
  });
});

describe("AuthSession", () => {
  it("caches tokens and refreshes when expiring", async () => {
    let nowMs = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);

    try {
      const calls = { nonce: 0, verify: 0, refresh: 0 };
      const fetchMock: FetchFn = async (input, init) => {
        const path = new URL(input.toString()).pathname;
        if (path === "/auth/nonce") {
          calls.nonce += 1;
          const body = JSON.parse(init?.body as string);
          expect(body.address).toBeTruthy();
          return new Response(JSON.stringify(noncePayload), { status: 200 });
        }
        if (path === "/auth/verify") {
          calls.verify += 1;
          const body = JSON.parse(init?.body as string);
          expect(body.address).toBeTruthy();
          return new Response(
            JSON.stringify({
              access_token: "access-1",
              refresh_token: "refresh-1",
              expires_in: 120,
            }),
            { status: 200 },
          );
        }
        if (path === "/auth/refresh") {
          calls.refresh += 1;
          return new Response(
            JSON.stringify({
              access_token: "access-2",
              refresh_token: "refresh-2",
              expires_in: 120,
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      };

      const session = new AuthSession({
        authUrl: "https://auth.example.com",
        signer: privateKeyToAccount(PRIVATE_KEY as Hex),
        refreshMarginSecs: 30,
        fetchFn: fetchMock,
      });

      const first = await session.accessToken();
      expect(first).toBe("access-1");
      expect(calls.nonce).toBe(1);
      expect(calls.verify).toBe(1);

      nowMs = 10_000;
      const cached = await session.accessToken();
      expect(cached).toBe("access-1");
      expect(calls.refresh).toBe(0);

      nowMs = 100_000;
      const refreshed = await session.accessToken();
      expect(refreshed).toBe("access-2");
      expect(calls.refresh).toBe(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("falls back to login when refresh returns 401", async () => {
    let nowMs = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);

    try {
      const calls = { nonce: 0, verify: 0, refresh: 0 };
      const fetchMock: FetchFn = async (input, init) => {
        const path = new URL(input.toString()).pathname;
        if (path === "/auth/nonce") {
          calls.nonce += 1;
          const body = JSON.parse(init?.body as string);
          expect(body.address).toBeTruthy();
          return new Response(JSON.stringify(noncePayload), { status: 200 });
        }
        if (path === "/auth/verify") {
          calls.verify += 1;
          const body = JSON.parse(init?.body as string);
          expect(body.address).toBeTruthy();
          return new Response(
            JSON.stringify({
              access_token: `access-${calls.verify}`,
              refresh_token: `refresh-${calls.verify}`,
              expires_in: 5,
            }),
            { status: 200 },
          );
        }
        if (path === "/auth/refresh") {
          calls.refresh += 1;
          return new Response("unauthorized", { status: 401 });
        }
        return new Response("not found", { status: 404 });
      };

      const session = new AuthSession({
        authUrl: "https://auth.example.com",
        signer: privateKeyToAccount(PRIVATE_KEY as Hex),
        refreshMarginSecs: 0,
        fetchFn: fetchMock,
      });

      const first = await session.accessToken();
      expect(first).toBe("access-1");

      nowMs = 10_000;
      const second = await session.accessToken();
      expect(second).toBe("access-2");
      expect(calls.refresh).toBe(1);
      expect(calls.verify).toBe(2);
      expect(calls.nonce).toBe(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("single-flights concurrent accessToken calls", async () => {
    const calls = { nonce: 0, verify: 0 };
    const fetchMock: FetchFn = async (input, init) => {
      const path = new URL(input.toString()).pathname;
      if (path === "/auth/nonce") {
        calls.nonce += 1;
        const body = JSON.parse(init?.body as string);
        expect(body.address).toBeTruthy();
        return new Response(JSON.stringify(noncePayload), { status: 200 });
      }
      if (path === "/auth/verify") {
        calls.verify += 1;
        const body = JSON.parse(init?.body as string);
        expect(body.address).toBeTruthy();
        return new Response(
          JSON.stringify({
            access_token: "access-1",
            refresh_token: "refresh-1",
            expires_in: 120,
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const session = new AuthSession({
      authUrl: "https://auth.example.com",
      signer: privateKeyToAccount(PRIVATE_KEY as Hex),
      fetchFn: fetchMock,
    });

    const [first, second] = await Promise.all([
      session.accessToken(),
      session.accessToken(),
    ]);
    expect(first).toBe("access-1");
    expect(second).toBe("access-1");
    expect(calls.nonce).toBe(1);
    expect(calls.verify).toBe(1);
  });

  it("rejects negative refresh margins", () => {
    expect(
      () =>
        new AuthSession({
          authUrl: "https://auth.example.com",
          signer: privateKeyToAccount(PRIVATE_KEY as Hex),
          refreshMarginSecs: -1,
        }),
    ).toThrow(AuthConfigError);
  });
});

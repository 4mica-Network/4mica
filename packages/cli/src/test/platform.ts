import type { IncomingMessage, ServerResponse } from "node:http";
import { text } from "node:stream/consumers";
import { verifyMessage } from "viem";
import { type MockServer, mockServer } from "./spawn.js";

/**
 * A stand-in for the platform API: enough of `apps/be` for the account
 * commands, holding its state in memory so a test can read what the cli
 * did to it.
 */
export interface MockPlatform extends MockServer {
  /** What the next polls of the token endpoint answer, in order. */
  polls: string[];
  /** Tokens the platform accepts. */
  tokens: Set<string>;
  /** Every token that arrived as a bearer, valid or not. */
  bearers: string[];
  wallets: { id: string; label: string; address: string; network: string }[];
  /** The message handed out by the next wallet-link challenge. */
  challenge?: string;
  clientName?: string;
}

export const ACCOUNT = {
  id: "019fce62-0000-7000-8000-000000000000",
  email: "ada@example.com",
  name: "Ada Lovelace",
  username: "ada",
};

export const GRANTED = "4mica_cli_granted-by-the-device-flow";

const NONCE = "nonce-1";

export const linkMessage = (address: string, chainId = 84532) =>
  [
    "app.4mica.io wants you to sign in with your Ethereum account:",
    address,
    "",
    "Link this wallet to your 4Mica account. This does not authorize any transfer of funds.",
    "",
    "URI: https://app.4mica.io",
    "Version: 1",
    `Chain ID: ${chainId}`,
    `Nonce: ${NONCE}`,
    "Issued At: 2026-01-01T00:00:00.000Z",
    "Expiration Time: 2026-01-01T00:05:00.000Z",
    "Resources:",
    "- urn:4mica:purpose:wallet-link",
    "- urn:4mica:user:019fce62-0000-7000-8000-000000000000",
  ].join("\n");

export async function mockPlatform(): Promise<MockPlatform> {
  // Filled in below, once the server exists: the handler reads the same
  // object the test writes to.
  const state = {
    polls: [],
    tokens: new Set<string>(),
    bearers: [],
    wallets: [],
  } as unknown as MockPlatform;
  let issued = "";

  const send = (res: ServerResponse, status: number, body?: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const route = `${req.method} ${url.pathname}`;
    const raw = await text(req);
    const body = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const bearer = req.headers.authorization?.replace(/^Bearer /, "");
    if (bearer) state.bearers.push(bearer);

    if (route === "POST /v1/cli/device/code") {
      state.clientName = body.client_name;
      return send(res, 200, {
        device_code: "device-code-1",
        user_code: "BCDF-GHJK",
        verification_uri: "http://app.test/cli/authorize",
        verification_uri_complete:
          "http://app.test/cli/authorize?code=BCDF-GHJK",
        expires_in: 600,
        interval: 1,
      });
    }
    if (route === "POST /v1/cli/device/token") {
      const next = state.polls.shift() ?? "granted";
      if (next !== "granted") {
        return send(res, 400, { error: next, message: next });
      }
      state.tokens.add(GRANTED);
      return send(res, 200, {
        access_token: GRANTED,
        token_type: "Bearer",
        expires_in: 7_776_000,
        scope: "account:read wallets:read wallets:write",
      });
    }

    if (!bearer || !state.tokens.has(bearer)) {
      return send(res, 401, { error: "unauthorized", message: "no" });
    }

    if (route === "GET /v1/cli/session") {
      return send(res, 200, {
        user: ACCOUNT,
        session: {
          id: "session-1",
          kind: "DEVICE",
          name: state.clientName ?? "ci",
          scopes: ["account:read", "wallets:read", "wallets:write"],
          createdAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2026-04-01T00:00:00.000Z",
        },
      });
    }
    if (route === "DELETE /v1/cli/session") {
      state.tokens.delete(bearer);
      return send(res, 204);
    }
    if (route === "GET /me/wallets") {
      const q = url.searchParams.get("q")?.toLowerCase();
      return send(res, 200, {
        items: state.wallets.filter((w) => !q || w.address === q),
        total: state.wallets.length,
        page: 1,
        limit: 100,
      });
    }
    if (route === "POST /me/wallets/siwe-nonce") {
      issued = state.challenge ?? linkMessage(body.address);
      return send(res, 201, {
        nonce: NONCE,
        message: issued,
        expiresAt: "2026-01-01T00:05:00.000Z",
      });
    }
    if (route === "POST /me/wallets") {
      const address = body.address.toLowerCase();
      if (state.wallets.some((w) => w.address === address)) {
        return send(res, 409, {
          error: "wallet_already_linked",
          message: "You have already linked that address on this network.",
        });
      }
      const proven = await verifyMessage({
        address: body.address as `0x${string}`,
        message: issued,
        signature: body.signature as `0x${string}`,
      });
      if (!proven || body.nonce !== NONCE) {
        return send(res, 400, {
          error: "invalid_signature",
          message: "That signature does not match the address.",
        });
      }
      const wallet = {
        id: `wallet-${state.wallets.length + 1}`,
        label: body.label,
        address,
        network: body.network,
        role: "BOTH",
        status: "ACTIVE",
        isDefault: false,
        verifiedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      };
      state.wallets.push(wallet);
      return send(res, 201, wallet);
    }
    const removal = /^DELETE \/me\/wallets\/(.+)$/.exec(route);
    if (removal) {
      state.wallets = state.wallets.filter((w) => w.id !== removal[1]);
      return send(res, 204);
    }
    return send(res, 404, { error: "not_found", message: route });
  };

  const server = await mockServer((req, res) => void handle(req, res));
  return Object.assign(state, server);
}

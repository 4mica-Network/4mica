/**
 * A mock 4mica core over HTTP, for tests that want the real `RpcProxy` in the
 * loop so error bodies and query strings are exercised as in production.
 */

import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { vi } from "vitest";
import { Client } from "@/client";
import { ConfigBuilder } from "@/config";

export const MOCK_CORE_CHAIN_ID = 1337;
export const CONTRACT_ADDRESS = "0x00000000000000000000000000000000C04E4a1c";
export const CLEARING_HOUSE_ADDRESS =
  "0x00000000000000000000000000000000C1ea4111";
export const GUARANTEE_REGISTRY_ADDRESS =
  "0x0000000000000000000000000000000000065E61";
// anvil key #1 stands in for the operator that signs guarantee receipts.
export const OPERATOR = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
// anvil key #0 is the connected client's signer.
export const PAYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
export const PAYER = privateKeyToAccount(PAYER_KEY);

export const MOCK_CORE_PUBLIC_PARAMS = {
  guarantee_signer: OPERATOR.address,
  contract_address: CONTRACT_ADDRESS,
  guarantee_registry_address: GUARANTEE_REGISTRY_ADDRESS,
  clearing_house_address: CLEARING_HOUSE_ADDRESS,
  eip712_name: "4micaClearingHouse",
  eip712_version: "1",
  chain_id: MOCK_CORE_CHAIN_ID,
  supported_payment_payload_versions: [1],
  validators: [],
};

export interface CoreRequest {
  method: string;
  url: URL;
  body: unknown;
  headers: Headers;
}

export interface CoreReply {
  status?: number;
  json?: unknown;
}

export type CoreHandler = (request: CoreRequest) => CoreReply;

export const ok = (json: unknown): CoreReply => ({ status: 200, json });

/** Routes `METHOD /path` to handlers and records every request. */
export class MockCore {
  readonly requests: CoreRequest[] = [];
  private readonly routes: Record<string, CoreHandler>;

  constructor(routes: Record<string, CoreHandler>) {
    this.routes = {
      "GET /core/public-params": () => ok(MOCK_CORE_PUBLIC_PARAMS),
      ...routes,
    };
  }

  readonly fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(String(input));
    const request: CoreRequest = {
      method: init?.method ?? "GET",
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: new Headers(init?.headers),
    };
    this.requests.push(request);
    let path = url.pathname;
    if (/^\/core\/payers\/[^/]+\/checkpoint-batch$/.test(path)) {
      path = "/core/payers/{payer}/checkpoint-batch";
    }
    const handler = this.routes[`${request.method} ${path}`];
    const reply = handler
      ? handler(request)
      : { status: 404, json: { error: `no route ${path}` } };
    return new Response(JSON.stringify(reply.json ?? null), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };

  count(method: string, path: string): number {
    return this.requests.filter(
      (request) => request.method === method && request.url.pathname === path,
    ).length;
  }
}

/** A real Client whose RPC traffic goes to `core`. */
export async function connect(core: MockCore): Promise<Client> {
  vi.stubGlobal("fetch", core.fetch);
  return Client.connect(
    new ConfigBuilder()
      .rpcUrl("https://core.example/")
      .walletPrivateKey(PAYER_KEY)
      .bearerToken("test-token")
      .build(),
  );
}

/** Shared fakes for the gasless-route tests, mirroring the Python stubs. */

import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ClientCtx } from "@/client/ctx";
import { Facilitator } from "@/client/facilitator";
import type { ContractGateway } from "@/contract";
import { coreDomainSeparator, permit2DomainSeparator } from "@/digest";
import { MissingTokenDomainSeparatorError } from "@/errors";
import type { FetchFn } from "@/rpc";
import { bytesFromHex, normalizeAddress } from "@/utils";

// anvil key #0
export const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
export const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const CONTRACT_ADDRESS = "0x00000000000000000000000000000000C04E4a1c";
export const TOKEN_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const TOKEN_DOMAIN = `0x${"ab".repeat(32)}`;
export const FACILITATOR_URL = "https://facilitator.example/";

export const account = privateKeyToAccount(TEST_PRIVATE_KEY);

export type FacilitatorHandler = (
  path: string,
  body: Record<string, unknown>,
) => { status?: number; json?: unknown; text?: string };

/** Wrap a per-request handler as the Facilitator's FetchFn. */
export function facilitatorFetch(handler: FacilitatorHandler): FetchFn {
  return async (input, init) => {
    const url = new URL(String(input));
    const body = JSON.parse(String(init?.body ?? "{}"));
    const result = handler(url.pathname, body);
    return new Response(result.text ?? JSON.stringify(result.json ?? {}), {
      status: result.status ?? 200,
    });
  };
}

export function makeCtx(options?: {
  handler?: FacilitatorHandler;
  tokenDomain?: string | null;
  gateway?: Partial<ContractGateway>;
  rpc?: Record<string, unknown>;
}): ClientCtx {
  const tokenDomain =
    options?.tokenDomain === undefined ? TOKEN_DOMAIN : options.tokenDomain;
  const facilitator = options?.handler
    ? new Facilitator(FACILITATOR_URL, facilitatorFetch(options.handler))
    : new Facilitator(undefined);
  const gateway = options?.gateway;
  return {
    signer: account,
    signerAddress: TEST_ADDRESS,
    contractAddress: normalizeAddress(CONTRACT_ADDRESS),
    chainId: 84532,
    permit2DomainSeparator: permit2DomainSeparator(84532),
    coreDomainSeparator: coreDomainSeparator(84532, CONTRACT_ADDRESS),
    facilitator,
    rpc: options?.rpc ?? {},
    async tokenDomainSeparator(token: string) {
      if (
        tokenDomain === null ||
        normalizeAddress(token) !== normalizeAddress(TOKEN_ADDRESS)
      ) {
        throw new MissingTokenDomainSeparatorError(token);
      }
      return tokenDomain;
    },
    async signHash(digest: Hex) {
      return bytesFromHex(await account.sign({ hash: digest }));
    },
    async gateway() {
      if (!gateway) {
        throw new Error("no gateway in this test");
      }
      return gateway as ContractGateway;
    },
  } as unknown as ClientCtx;
}

/** Rebuild a 65-byte signature from an authorization's (v, r, s). */
export function vrsSignature(auth: { v: number; r: string; s: string }): Hex {
  const strip = (value: string) => value.replace(/^0x/, "");
  return `0x${strip(auth.r)}${strip(auth.s)}${auth.v.toString(16).padStart(2, "0")}` as Hex;
}

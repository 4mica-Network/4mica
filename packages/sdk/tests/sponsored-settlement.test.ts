/**
 * Facilitator-sponsored settlement flows against a mocked facilitator,
 * mirroring `sdk-rust/tests/sponsored_settlement.rs` and the Python suite.
 */

import { describe, expect, it } from "vitest";
import { TokenRoute } from "@/client/model";
import { SettlementClient } from "@/client/settlement";
import type { ContractGateway } from "@/contract";
import { FacilitatorRejectedError, InvalidParamsError } from "@/errors";
import { ClearingSettlementActionResponse } from "@/models";
import type { RpcProxy } from "@/rpc";
import {
  type FacilitatorHandler,
  makeCtx,
  TEST_ADDRESS,
  TOKEN_ADDRESS,
} from "./helpers/ctx";

const CLEARING_HOUSE = "0x0000000000000000000000000000000000000009";
const CYCLE_ID = `0x${"aa".repeat(32)}`;
const NATIVE = "0x0000000000000000000000000000000000000000";
const TX_HASH = `0x${"ef".repeat(32)}`;

const success = (extra: Record<string, unknown> = {}) => ({
  json: { success: true, txHash: TX_HASH, ...extra },
});

const rejection = (code: string) => ({
  json: { success: false, errorCode: code, error: code.toLowerCase() },
});

const payAction = (asset: string = TOKEN_ADDRESS) =>
  ClearingSettlementActionResponse.fromRpc({
    contract_address: CLEARING_HOUSE,
    function_name: "payNetDebit",
    action: "pay_net_debit",
    cycle_id: CYCLE_ID,
    cycle_id_text: "c",
    asset_address: asset,
    participant: TEST_ADDRESS,
    amount: "5000",
    payable_value: asset === NATIVE ? "5000" : "0",
    proof: [],
  });

const claimAction = () =>
  ClearingSettlementActionResponse.fromRpc({
    contract_address: CLEARING_HOUSE,
    function_name: "claimNetCreditFor",
    action: "claim_net_credit",
    cycle_id: CYCLE_ID,
    cycle_id_text: "c",
    asset_address: TOKEN_ADDRESS,
    participant: TEST_ADDRESS,
    amount: "5000",
    payable_value: "0",
    proof: [],
  });

function settlementClient(options: {
  handler: FacilitatorHandler;
  asset?: string;
  gateway?: Partial<ContractGateway>;
}): SettlementClient {
  const rpc = {
    getClearingPayNetDebitAction: async () => payAction(options.asset),
    getClearingClaimNetCreditAction: async () => claimAction(),
  } as unknown as RpcProxy;
  return new SettlementClient(
    makeCtx({ handler: options.handler, gateway: options.gateway, rpc }),
  );
}

describe("sponsored settlement — pay", () => {
  it("eip3009 pay pins the nonce to the cycle id and posts the wire shape", async () => {
    const seen: { path?: string; body?: Record<string, unknown> } = {};
    const settlement = settlementClient({
      handler: (path, body) => {
        seen.path = path;
        seen.body = body;
        return success();
      },
    });

    const receipt = await settlement.pay(CYCLE_ID).eip3009().send();

    expect(seen.path).toBe("/clearing/pay");
    expect(seen.body?.cycleId).toBe(CYCLE_ID);
    expect(seen.body?.assetTransferMethod).toBe("eip3009");
    const authorization = seen.body?.authorization as Record<string, unknown>;
    // The nonce IS the cycle id — payNetDebitWithAuthorization requires it.
    expect(authorization.nonce).toBe(CYCLE_ID);
    expect(receipt.route).toBe(TokenRoute.Eip3009);
    expect(receipt.account).toBe(TEST_ADDRESS);
  });

  it("gasless pay falls from eip3009 to permit2 on a simulation revert", async () => {
    const methods: string[] = [];
    const settlement = settlementClient({
      handler: (_path, body) => {
        methods.push(String(body.assetTransferMethod));
        if (body.assetTransferMethod === "eip3009") {
          return rejection("SIMULATION_REVERTED");
        }
        return success();
      },
    });

    const receipt = await settlement.pay(CYCLE_ID).gasless().send();

    expect(methods).toEqual(["eip3009", "permit2"]);
    expect(receipt.route).toBe(TokenRoute.Permit2);
    // The permit2 nonce is uint256(cycleId).
  });

  it("gasless pay refuses a native-asset cycle", async () => {
    const settlement = settlementClient({
      handler: () => success(),
      asset: NATIVE,
    });
    await expect(settlement.pay(CYCLE_ID).gasless().send()).rejects.toThrow(
      InvalidParamsError,
    );
  });

  it("auto pay self-funds a native cycle without asking the facilitator", async () => {
    const posts: string[] = [];
    const gateway: Partial<ContractGateway> = {
      erc20Allowance: (async () => 0n) as never,
      payNetDebit: (async () => ({
        transactionHash: "0xtx",
        status: "success",
      })) as never,
    };
    const settlement = settlementClient({
      handler: (path) => {
        posts.push(path);
        return success();
      },
      asset: NATIVE,
      gateway,
    });

    const receipt = await settlement.pay(CYCLE_ID).send();

    expect(posts).toEqual([]);
    expect(receipt.route).toBe(TokenRoute.SelfFunded);
  });

  it("auto pay falls back to self-funded when nobody sponsors", async () => {
    const gateway: Partial<ContractGateway> = {
      erc20Allowance: (async () => 1_000_000n) as never,
      payNetDebit: (async () => ({
        transactionHash: "0xtx",
        status: "success",
      })) as never,
    };
    const settlement = settlementClient({
      handler: () => rejection("NO_RELAYER_AVAILABLE"),
      gateway,
    });

    const receipt = await settlement.pay(CYCLE_ID).send();
    expect(receipt.route).toBe(TokenRoute.SelfFunded);
  });

  it("auto pay does not retry a rejection that names the payment", async () => {
    const settlement = settlementClient({
      handler: () => rejection("INSUFFICIENT_BALANCE"),
    });
    const failure = await settlement
      .pay(CYCLE_ID)
      .send()
      .catch((err) => err);
    expect(failure).toBeInstanceOf(FacilitatorRejectedError);
    expect(failure.code).toBe("INSUFFICIENT_BALANCE");
  });

  it("verify hits the verify route only", async () => {
    const paths: string[] = [];
    const settlement = settlementClient({
      handler: (path) => {
        paths.push(path);
        return { json: { isValid: true } };
      },
    });
    const authorization = await settlement.pay(CYCLE_ID).eip3009().sign();
    await settlement
      .pay(CYCLE_ID)
      .eip3009()
      .authorization(authorization)
      .verify();
    expect(paths).toEqual(["/clearing/pay/verify"]);
  });
});

describe("sponsored settlement — claim", () => {
  it("gasless claim posts only the cycle and creditor", async () => {
    const seen: { path?: string; body?: Record<string, unknown> } = {};
    const settlement = settlementClient({
      handler: (path, body) => {
        seen.path = path;
        seen.body = body;
        return success();
      },
    });

    const receipt = await settlement.claim(CYCLE_ID).gasless().send();

    expect(seen.path).toBe("/clearing/claim");
    expect(seen.body).toEqual({ cycleId: CYCLE_ID, creditor: TEST_ADDRESS });
    expect(receipt.account).toBe(TEST_ADDRESS);
  });

  it("gasless claim refuses a mismatched creditor echo", async () => {
    const other = "0x1111111111111111111111111111111111111111";
    const settlement = settlementClient({
      handler: () => success({ creditor: other }),
    });
    await expect(settlement.claim(CYCLE_ID).gasless().send()).rejects.toThrow(
      /echoed creditor/,
    );
  });

  it("auto claim falls back to self-funded when nobody sponsors", async () => {
    const gateway: Partial<ContractGateway> = {
      claimNetCreditFor: (async () => ({
        transactionHash: "0xtx",
        status: "success",
      })) as never,
    };
    const settlement = settlementClient({
      handler: () => rejection("NO_RELAYER_AVAILABLE"),
      gateway,
    });

    const receipt = await settlement.claim(CYCLE_ID).send();
    expect(receipt.account).toBe(TEST_ADDRESS);
  });

  it("auto claim does not retry a rejection that names the claim", async () => {
    const settlement = settlementClient({
      handler: () => rejection("ACTION_UNAVAILABLE"),
    });
    const failure = await settlement
      .claim(CYCLE_ID)
      .send()
      .catch((err) => err);
    expect(failure).toBeInstanceOf(FacilitatorRejectedError);
    expect(failure.code).toBe("ACTION_UNAVAILABLE");
  });
});

/**
 * Gasless withdrawal flows against a mocked facilitator, mirroring
 * `sdk-rust/tests/gasless_withdraw.rs` and the Python suite.
 */

import { describe, expect, it } from "vitest";
import { Route } from "@/client/model";
import { WithdrawClient } from "@/client/withdraw";
import type { ContractGateway } from "@/contract";
import {
  FacilitatorRejectedError,
  InvalidParamsError,
  OutcomeUnknownError,
} from "@/errors";
import {
  type FacilitatorHandler,
  makeCtx,
  TEST_ADDRESS,
  TOKEN_ADDRESS,
} from "./helpers/ctx";

const AMOUNT = 1000n;
const TX_HASH = `0x${"cd".repeat(32)}`;

const success = (extra: Record<string, unknown> = {}) => ({
  json: { success: true, txHash: TX_HASH, ...extra },
});

const rejection = (code: string) => ({
  json: { success: false, errorCode: code, error: code.toLowerCase() },
});

const withdrawClient = (
  handler: FacilitatorHandler,
  gateway?: Partial<ContractGateway>,
) => new WithdrawClient(makeCtx({ handler, gateway }));

describe("gasless withdrawals", () => {
  it("request posts the signed authorization", async () => {
    const seen: { path?: string; body?: Record<string, unknown> } = {};
    const client = withdrawClient((path, body) => {
      seen.path = path;
      seen.body = body;
      return success();
    });

    const receipt = await client
      .request(TOKEN_ADDRESS, AMOUNT)
      .gasless()
      .send();

    expect(seen.path).toBe("/withdraw");
    expect(seen.body?.action).toBe("request");
    const authorization = seen.body?.authorization as Record<string, unknown>;
    expect(authorization.user).toBe(TEST_ADDRESS);
    expect(String(authorization.asset).toLowerCase()).toBe(
      TOKEN_ADDRESS.toLowerCase(),
    );
    expect(authorization.amount).toBe(`0x${AMOUNT.toString(16)}`);
    expect(typeof authorization.signature).toBe("string");

    expect(receipt.route).toBe(Route.Gasless);
    expect(receipt.account).toBe(TEST_ADDRESS);
  });

  it("cancel carries no amount", async () => {
    const seen: { body?: Record<string, unknown> } = {};
    const client = withdrawClient((_path, body) => {
      seen.body = body;
      return success();
    });

    await client.cancel(TOKEN_ADDRESS).gasless().send();

    expect(seen.body?.action).toBe("cancel");
    const authorization = seen.body?.authorization as Record<string, unknown>;
    expect(authorization.amount).toBeUndefined();
  });

  it("finalize takes no signature", async () => {
    const seen: { body?: Record<string, unknown> } = {};
    const client = withdrawClient((_path, body) => {
      seen.body = body;
      return success();
    });

    await client.finalize(TOKEN_ADDRESS).gasless().send();

    expect(seen.body).toEqual({
      action: "finalize",
      user: TEST_ADDRESS,
      asset: TOKEN_ADDRESS,
    });
  });

  it("falls back to self-funded when nobody sponsors", async () => {
    const calls: string[] = [];
    const gateway: Partial<ContractGateway> = {
      requestWithdrawal: (async () => {
        calls.push("requestWithdrawal");
        return { transactionHash: "0xtx", status: "success" };
      }) as never,
    };
    const client = withdrawClient(
      () => rejection("NO_RELAYER_AVAILABLE"),
      gateway,
    );

    const receipt = await client.request(TOKEN_ADDRESS, AMOUNT).send();

    expect(receipt.route).toBe(Route.SelfFunded);
    expect(calls).toEqual(["requestWithdrawal"]);
  });

  it("does not retry a rejection that names the request", async () => {
    const client = withdrawClient(() => rejection("NONCE_ALREADY_USED"));
    const failure = await client
      .request(TOKEN_ADDRESS, AMOUNT)
      .send()
      .catch((err) => err);
    expect(failure).toBeInstanceOf(FacilitatorRejectedError);
    expect(failure.code).toBe("NONCE_ALREADY_USED");
  });

  it("does not retry an unknown outcome", async () => {
    const client = withdrawClient(() => ({ status: 500, text: "boom" }));
    await expect(client.request(TOKEN_ADDRESS, AMOUNT).send()).rejects.toThrow(
      OutcomeUnknownError,
    );
  });

  it("refuses an attached authorization that disagrees with the builder", async () => {
    const client = withdrawClient(() => success());
    const authorization = await client
      .request(TOKEN_ADDRESS, AMOUNT)
      .gasless()
      .sign();
    await expect(
      client
        .request(TOKEN_ADDRESS, AMOUNT * 2n)
        .gasless()
        .authorization(authorization)
        .send(),
    ).rejects.toThrow(InvalidParamsError);
  });

  it("verify hits the verify route only", async () => {
    const paths: string[] = [];
    const client = withdrawClient((path) => {
      paths.push(path);
      return { json: { isValid: true } };
    });
    const authorization = await client
      .request(TOKEN_ADDRESS, AMOUNT)
      .gasless()
      .sign();
    await client
      .request(TOKEN_ADDRESS, AMOUNT)
      .gasless()
      .authorization(authorization)
      .verify();
    expect(paths).toEqual(["/withdraw/verify"]);
  });
});

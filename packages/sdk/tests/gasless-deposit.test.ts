/**
 * Gasless deposit flows against a mocked facilitator, mirroring
 * `sdk-rust/tests/gasless_deposit.rs` and the Python suite.
 */

import { describe, expect, it, vi } from "vitest";
import { DepositClient } from "@/client/deposit";
import { TokenRoute } from "@/client/model";
import type { ContractGateway } from "@/contract";
import {
  Erc20AllowanceRequiredError,
  FacilitatorRejectedError,
  InvalidParamsError,
  OutcomeUnknownError,
  Permit2AllowanceRequiredError,
} from "@/errors";
import {
  CONTRACT_ADDRESS,
  type FacilitatorHandler,
  makeCtx,
  TEST_ADDRESS,
  TOKEN_ADDRESS,
} from "./helpers/ctx";

const AMOUNT = 1_000_000n;
const TX_HASH = `0x${"ab".repeat(32)}`;

const success = (extra: Record<string, unknown> = {}) => ({
  json: { success: true, txHash: TX_HASH, ...extra },
});

const rejection = (code: string, extra: Record<string, unknown> = {}) => ({
  json: {
    success: false,
    errorCode: code,
    error: code.toLowerCase(),
    ...extra,
  },
});

const depositClient = (
  handler: FacilitatorHandler,
  gateway?: Partial<ContractGateway>,
  tokenDomain?: string | null,
) => new DepositClient(makeCtx({ handler, gateway, tokenDomain }));

const mined = async () => ({ transactionHash: "0xtx", status: "success" });

/** EIP-3009 is refused outright and Permit2 lacks an allowance the token cannot sign for. */
const noGaslessRoute: FacilitatorHandler = (_path, body) =>
  body.assetTransferMethod === "eip3009"
    ? rejection("SIMULATION_REVERTED")
    : rejection("PERMIT2_ALLOWANCE_REQUIRED");

describe("gasless deposits", () => {
  it("eip3009 send posts the wire shape", async () => {
    const seen: { path?: string; body?: Record<string, unknown> } = {};
    const client = depositClient((path, body) => {
      seen.path = path;
      seen.body = body;
      return success();
    });

    const receipt = await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send();

    expect(seen.path).toBe("/deposit");
    const body = seen.body as Record<string, unknown>;
    expect(body.assetTransferMethod).toBe("eip3009");
    expect(String(body.asset).toLowerCase()).toBe(TOKEN_ADDRESS.toLowerCase());
    expect(body.amount).toBe(String(AMOUNT));
    const authorization = body.authorization as Record<string, unknown>;
    expect(authorization.from).toBe(TEST_ADDRESS);
    expect(authorization.validAfter).toBe("0x0");
    expect(Object.keys(authorization).sort()).toEqual([
      "from",
      "nonce",
      "r",
      "s",
      "v",
      "validAfter",
      "validBefore",
    ]);

    expect(receipt.route).toBe(TokenRoute.Eip3009);
    expect(receipt.account).toBe(TEST_ADDRESS);
    expect(receipt.txHash).toBe(TX_HASH);
  });

  it("gasless falls from eip3009 to permit2 on a simulation revert", async () => {
    const methods: string[] = [];
    const client = depositClient((_path, body) => {
      methods.push(String(body.assetTransferMethod));
      if (body.assetTransferMethod === "eip3009") {
        return rejection("SIMULATION_REVERTED");
      }
      return success();
    });

    const receipt = await client.of(TOKEN_ADDRESS, AMOUNT).gasless().send();

    expect(methods).toEqual(["eip3009", "permit2"]);
    expect(receipt.route).toBe(TokenRoute.Permit2);
  });

  it("sponsored permit2 signs the missing approval", async () => {
    const bodies: Record<string, unknown>[] = [];
    const client = depositClient((_path, body) => {
      bodies.push(body);
      if (!("eip2612Permit" in body)) {
        return rejection("PERMIT2_ALLOWANCE_REQUIRED", {
          permit2Allowance: { eip2612Nonce: "7" },
        });
      }
      return success();
    });

    const receipt = await client
      .of(TOKEN_ADDRESS, AMOUNT)
      .permit2()
      .sponsorApproval()
      .send();

    expect(receipt.route).toBe(TokenRoute.SponsoredPermit2);
    const permit = bodies.at(-1)?.eip2612Permit as Record<string, unknown>;
    expect(permit.value).toBe((2n ** 256n - 1n).toString());
    expect(Object.keys(permit).sort()).toEqual([
      "deadline",
      "r",
      "s",
      "v",
      "value",
    ]);
    // The retry reuses the same Permit2 authorization it already signed.
    expect(bodies[0]?.permit2Authorization).toEqual(
      bodies.at(-1)?.permit2Authorization,
    );
  });

  it("surfaces an unsponsorable allowance", async () => {
    const client = depositClient(() => rejection("PERMIT2_ALLOWANCE_REQUIRED"));
    const failure = await client
      .of(TOKEN_ADDRESS, AMOUNT)
      .permit2()
      .send()
      .catch((err) => err);
    expect(failure).toBeInstanceOf(Permit2AllowanceRequiredError);
    expect(failure.eip2612Nonce).toBeUndefined();
  });

  it("auto route self-funds native", async () => {
    const calls: string[] = [];
    const gateway: Partial<ContractGateway> = {
      deposit: (async () => {
        calls.push("deposit");
        return { transactionHash: "0xtx", status: "success" };
      }) as never,
    };
    const client = depositClient(() => rejection("UNREACHED"), gateway);

    const receipt = await client.of(null, AMOUNT).send();

    expect(receipt.route).toBe(TokenRoute.SelfFunded);
    expect(calls).toContain("deposit");
  });

  it("does not retry a rejection that names the deposit", async () => {
    const client = depositClient(() => rejection("EXPIRED"));
    const failure = await client
      .of(TOKEN_ADDRESS, AMOUNT)
      .gasless()
      .send()
      .catch((err) => err);
    expect(failure).toBeInstanceOf(FacilitatorRejectedError);
    expect(failure.code).toBe("EXPIRED");
  });

  it("treats a mismatched echo as an unknown outcome", async () => {
    const other = "0x1111111111111111111111111111111111111111";
    const client = depositClient(() => success({ from: other }));
    await expect(
      client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send(),
    ).rejects.toThrow(/echoed from/);
  });

  it("treats an unreadable amount echo as an unknown outcome", async () => {
    const client = depositClient(() => success({ amount: "not-a-number" }));
    await expect(
      client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send(),
    ).rejects.toThrow(/echoed amount/);
  });

  it("treats success without a txHash as an unknown outcome", async () => {
    const client = depositClient(() => ({ json: { success: true } }));
    await expect(
      client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send(),
    ).rejects.toThrow(OutcomeUnknownError);
  });

  it("verify reports the rejection without submitting", async () => {
    const paths: string[] = [];
    const client = depositClient((path) => {
      paths.push(path);
      return {
        json: {
          isValid: false,
          invalidReason: "expired",
          errorCode: "EXPIRED",
        },
      };
    });
    const authorization = await client
      .of(TOKEN_ADDRESS, AMOUNT)
      .eip3009()
      .sign();
    await expect(
      client
        .of(TOKEN_ADDRESS, AMOUNT)
        .eip3009()
        .authorization(authorization)
        .verify(),
    ).rejects.toThrow(/expired/);
    expect(paths).toEqual(["/deposit/verify"]);
  });

  it("gasless pin refuses native", async () => {
    const client = depositClient(() => success());
    await expect(client.of(null, AMOUNT).gasless().send()).rejects.toThrow(
      InvalidParamsError,
    );
  });

  it("auto route falls through to self-funded when no gasless scheme is left", async () => {
    const methods: string[] = [];
    const erc20Allowance = vi.fn(async () => AMOUNT);
    const deposit = vi.fn(mined);
    const client = depositClient(
      (path, body) => {
        methods.push(String(body.assetTransferMethod));
        return noGaslessRoute(path, body);
      },
      { erc20Allowance: erc20Allowance as never, deposit: deposit as never },
    );

    const receipt = await client.of(TOKEN_ADDRESS, AMOUNT).send();

    expect(methods).toEqual(["eip3009", "permit2"]);
    expect(receipt.route).toBe(TokenRoute.SelfFunded);
    expect(deposit).toHaveBeenCalledTimes(1);
    // The fallback needs an allowance the gasless routes never did. It is
    // read once, here; the gateway does not read it again.
    expect(erc20Allowance).toHaveBeenCalledTimes(1);
  });

  it("a fallback without an ERC-20 allowance is refused, not broadcast", async () => {
    const deposit = vi.fn(mined);
    const client = depositClient(noGaslessRoute, {
      erc20Allowance: (async () => 0n) as never,
      deposit: deposit as never,
    });

    const failure = await client
      .of(TOKEN_ADDRESS, AMOUNT)
      .send()
      .catch((err) => err);

    expect(failure).toBeInstanceOf(Erc20AllowanceRequiredError);
    expect(failure.needed).toBe(AMOUNT);
    expect(failure.spender.toLowerCase()).toBe(CONTRACT_ADDRESS.toLowerCase());
    expect(deposit).not.toHaveBeenCalled();
  });

  it("a token with no published domain deposits over permit2", async () => {
    const methods: string[] = [];
    const client = depositClient(
      (_path, body) => {
        methods.push(String(body.assetTransferMethod));
        return success();
      },
      undefined,
      null,
    );

    const receipt = await client.of(TOKEN_ADDRESS, AMOUNT).send();

    // No EIP-3009 digest can be built without the token's domain, so that
    // scheme is skipped without a wasted request; Permit2's domain derives
    // from the chain id.
    expect(methods).toEqual(["permit2"]);
    expect(receipt.route).toBe(TokenRoute.Permit2);
  });

  it("a missing allowance without a token domain cannot be sponsored", async () => {
    const bodies: Record<string, unknown>[] = [];
    const client = depositClient(
      (_path, body) => {
        bodies.push(body);
        if (!("eip2612Permit" in body)) {
          return rejection("PERMIT2_ALLOWANCE_REQUIRED", {
            error: "approve permit2 first",
            permit2Allowance: { eip2612Nonce: "7" },
          });
        }
        return success();
      },
      undefined,
      null,
    );

    const failure = await client
      .of(TOKEN_ADDRESS, AMOUNT)
      .permit2()
      .sponsorApproval()
      .send()
      .catch((err) => err);

    expect(failure).toBeInstanceOf(Permit2AllowanceRequiredError);
    expect(failure.eip2612Nonce).toBeUndefined();
    // Re-thrown without the nonce, and without re-wrapping the message.
    expect(failure.reason).toBe("approve permit2 first");
    expect(failure.message).toBe(
      "permit2 requires a prior approve(PERMIT2, ...): approve permit2 first",
    );
    expect(bodies).toHaveLength(1);
  });
});

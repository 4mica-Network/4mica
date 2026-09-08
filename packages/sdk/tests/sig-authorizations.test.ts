/**
 * Authorization builders: what they bind, and that every signature recovers
 * to the client's signer over the exact digest a redeemer would rebuild.
 */

import { type Hex, recoverAddress } from "viem";
import { describe, expect, it } from "vitest";
import * as sig from "@/client/sig";
import {
  digestForCancelWithdrawal,
  digestForPermit,
  digestForPermit2Transfer,
  digestForReceiveAuthorization,
  digestForRequestWithdrawal,
  PERMIT2_ADDRESS,
} from "@/digest";
import { MissingTokenDomainSeparatorError } from "@/errors";
import {
  CONTRACT_ADDRESS,
  makeCtx,
  TEST_ADDRESS,
  TOKEN_ADDRESS,
  TOKEN_DOMAIN,
  vrsSignature,
} from "./helpers/ctx";

const CYCLE_ID = `0x${"aa".repeat(32)}`;

describe("authorization builders", () => {
  it("eip3009 authorization recovers and binds the contract", async () => {
    const ctx = makeCtx();
    const auth = await sig.eip3009Authorization(ctx, TOKEN_ADDRESS, 1_000_000n);

    expect(auth.fromAddress).toBe(TEST_ADDRESS);
    expect(auth.validAfter).toBe(0);
    expect(auth.validBefore).toBeGreaterThan(auth.validAfter);
    expect(BigInt(auth.nonce)).not.toBe(0n);

    const digest = digestForReceiveAuthorization(
      TOKEN_DOMAIN,
      auth.fromAddress,
      CONTRACT_ADDRESS,
      1_000_000n,
      auth.validAfter,
      auth.validBefore,
      auth.nonce,
    );
    await expect(
      recoverAddress({ hash: digest, signature: vrsSignature(auth) }),
    ).resolves.toBe(TEST_ADDRESS);
  });

  it("debit authorization pins the nonce to the cycle id", async () => {
    const ctx = makeCtx();
    const receiver = "0x2222222222222222222222222222222222222222";
    const auth = await sig.debitAuthorization(
      ctx,
      TOKEN_ADDRESS,
      receiver,
      5000n,
      CYCLE_ID,
    );

    expect(auth.nonce).toBe(CYCLE_ID);
    const digest = digestForReceiveAuthorization(
      TOKEN_DOMAIN,
      auth.fromAddress,
      receiver,
      5000n,
      auth.validAfter,
      auth.validBefore,
      CYCLE_ID,
    );
    await expect(
      recoverAddress({ hash: digest, signature: vrsSignature(auth) }),
    ).resolves.toBe(TEST_ADDRESS);
  });

  it("debit permit2 nonce is uint256 of the cycle id", async () => {
    const ctx = makeCtx();
    const receiver = "0x2222222222222222222222222222222222222222";
    const auth = await sig.debitPermit2Authorization(
      ctx,
      TOKEN_ADDRESS,
      receiver,
      5000n,
      CYCLE_ID,
    );

    expect(auth.nonce).toBe(BigInt(CYCLE_ID));
    const digest = digestForPermit2Transfer(
      ctx.permit2DomainSeparator,
      TOKEN_ADDRESS,
      5000n,
      receiver,
      auth.nonce,
      auth.deadline,
    );
    await expect(
      recoverAddress({ hash: digest, signature: auth.signature as Hex }),
    ).resolves.toBe(TEST_ADDRESS);
  });

  it("eip2612 permit grants Permit2 unlimited", async () => {
    const ctx = makeCtx();
    const permit = await sig.eip2612Permit(ctx, TOKEN_ADDRESS, 7n);

    expect(permit.value).toBe(2n ** 256n - 1n);
    const digest = digestForPermit(
      TOKEN_DOMAIN,
      TEST_ADDRESS,
      PERMIT2_ADDRESS,
      permit.value,
      7n,
      permit.deadline,
    );
    await expect(
      recoverAddress({ hash: digest, signature: vrsSignature(permit) }),
    ).resolves.toBe(TEST_ADDRESS);
  });

  it("refuses to sign without a token domain separator", async () => {
    const ctx = makeCtx({ tokenDomain: null });
    await expect(
      sig.eip3009Authorization(ctx, TOKEN_ADDRESS, 1n),
    ).rejects.toThrow(MissingTokenDomainSeparatorError);
  });

  it("withdrawal authorizations sign under the core domain", async () => {
    const ctx = makeCtx();
    const request = await sig.requestWithdrawalAuthorization(
      ctx,
      TOKEN_ADDRESS,
      1000n,
    );
    const cancel = await sig.cancelWithdrawalAuthorization(ctx, TOKEN_ADDRESS);

    const requestDigest = digestForRequestWithdrawal(
      ctx.coreDomainSeparator,
      request.user,
      request.asset,
      request.amount,
      request.validAfter,
      request.validBefore,
      request.nonce,
    );
    const cancelDigest = digestForCancelWithdrawal(
      ctx.coreDomainSeparator,
      cancel.user,
      cancel.asset,
      cancel.validAfter,
      cancel.validBefore,
      cancel.nonce,
    );
    await expect(
      recoverAddress({
        hash: requestDigest,
        signature: request.signature as Hex,
      }),
    ).resolves.toBe(TEST_ADDRESS);
    await expect(
      recoverAddress({
        hash: cancelDigest,
        signature: cancel.signature as Hex,
      }),
    ).resolves.toBe(TEST_ADDRESS);
    expect(request.nonce).not.toBe(cancel.nonce);
  });
});

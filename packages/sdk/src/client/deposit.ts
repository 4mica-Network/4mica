import type {
  Eip2612Permit,
  Permit2Authorization,
  ReceiveAuthorization,
} from "@/authorizations";
import type { ClientCtx } from "@/client/ctx";
import {
  confirmFacilitatorEcho,
  refusesTheAuthorization,
  rejectionError,
} from "@/client/facilitator";
import { Asset, type DepositReceipt, TokenRoute } from "@/client/model";
import * as sig from "@/client/sig";
import type { TxReceiptWaitOptions } from "@/contract";
import {
  AmountZeroError,
  Erc20AllowanceRequiredError,
  InvalidParamsError,
  MissingTokenDomainSeparatorError,
  OutcomeUnknownError,
  Permit2AllowanceRequiredError,
} from "@/errors";
import { parseU256 } from "@/utils";

export class DepositClient {
  constructor(private ctx: ClientCtx) {}
  isGaslessAvailable(): boolean {
    return this.ctx.facilitator.isConfigured();
  }

  of(
    asset: Asset | string | null | undefined,
    amount: number | bigint | string,
  ): DepositBuilder {
    return new DepositBuilder(this.ctx, Asset.coerce(asset), parseU256(amount));
  }
}

abstract class DepositBase {
  constructor(
    protected ctx: ClientCtx,
    protected asset: Asset,
    protected amount: bigint,
  ) {
    if (amount <= 0n) {
      throw new AmountZeroError("deposit amount must be positive");
    }
  }

  protected erc20Token(): string {
    if (this.asset.isNative) {
      throw new InvalidParamsError(
        "native ETH has no gasless route; deposit it self-funded",
      );
    }
    return this.asset.address;
  }
}

export class DepositBuilder extends DepositBase {
  gasless(): GaslessDeposit {
    return new GaslessDeposit(this.ctx, this.asset, this.amount);
  }
  eip3009(): Eip3009Deposit {
    return new Eip3009Deposit(this.ctx, this.asset, this.amount);
  }
  permit2(): Permit2Deposit {
    return new Permit2Deposit(this.ctx, this.asset, this.amount);
  }

  selfFunded(): SelfFundedDeposit {
    return new SelfFundedDeposit(this.ctx, this.asset, this.amount);
  }

  async send(waitOptions?: TxReceiptWaitOptions): Promise<DepositReceipt> {
    if (this.asset.isNative || !this.ctx.facilitator.isConfigured()) {
      return this.selfFunded().send(waitOptions);
    }
    const token = this.asset.address;
    try {
      return await sendEip3009(this.ctx, token, this.amount);
    } catch (rejection) {
      if (!refusesTheAuthorization(rejection)) {
        throw rejection;
      }
    }

    try {
      return await sendSponsoredPermit2(this.ctx, token, this.amount);
    } catch (rejection) {
      if (rejection instanceof Permit2AllowanceRequiredError) {
        return sendSelfFunded(this.ctx, this.asset, this.amount, waitOptions);
      }
      throw rejection;
    }
  }
}

export class GaslessDeposit extends DepositBase {
  async send(): Promise<DepositReceipt> {
    const token = this.erc20Token();
    try {
      return await sendEip3009(this.ctx, token, this.amount);
    } catch (rejection) {
      if (!refusesTheAuthorization(rejection)) {
        throw rejection;
      }
    }
    return sendSponsoredPermit2(this.ctx, token, this.amount);
  }
}

export class Eip3009Deposit extends DepositBase {
  async sign(): Promise<ReceiveAuthorization> {
    return sig.eip3009Authorization(this.ctx, this.erc20Token(), this.amount);
  }
  authorization(authorization: ReceiveAuthorization): AuthorizedEip3009Deposit {
    return new AuthorizedEip3009Deposit(
      this.ctx,
      this.asset,
      this.amount,
      authorization,
    );
  }
  async send(): Promise<DepositReceipt> {
    return sendEip3009(this.ctx, this.erc20Token(), this.amount);
  }
}

export class Permit2Deposit extends DepositBase {
  sponsorApproval(): SponsoredPermit2Deposit {
    return new SponsoredPermit2Deposit(this.ctx, this.asset, this.amount);
  }
  async sign(): Promise<Permit2Authorization> {
    return sig.permit2Authorization(this.ctx, this.erc20Token(), this.amount);
  }
  authorization(authorization: Permit2Authorization): AuthorizedPermit2Deposit {
    return new AuthorizedPermit2Deposit(
      this.ctx,
      this.asset,
      this.amount,
      authorization,
    );
  }
  async send(): Promise<DepositReceipt> {
    const token = this.erc20Token();
    const authorization = await sig.permit2Authorization(
      this.ctx,
      token,
      this.amount,
    );
    return submit(
      this.ctx,
      permit2Request(token, this.amount, authorization, undefined),
      TokenRoute.Permit2,
      authorization.fromAddress,
      token,
      this.amount,
    );
  }
}

export class SponsoredPermit2Deposit extends DepositBase {
  async send(): Promise<DepositReceipt> {
    return sendSponsoredPermit2(this.ctx, this.erc20Token(), this.amount);
  }
}

export class AuthorizedEip3009Deposit extends DepositBase {
  constructor(
    ctx: ClientCtx,
    asset: Asset,
    amount: bigint,
    private auth: ReceiveAuthorization,
  ) {
    super(ctx, asset, amount);
  }
  async verify(): Promise<void> {
    await verifyRequest(
      this.ctx,
      eip3009Request(this.erc20Token(), this.amount, this.auth),
    );
  }
  async send(): Promise<DepositReceipt> {
    const token = this.erc20Token();
    return submit(
      this.ctx,
      eip3009Request(token, this.amount, this.auth),
      TokenRoute.Eip3009,
      this.auth.fromAddress,
      token,
      this.amount,
    );
  }
}

export class AuthorizedPermit2Deposit extends DepositBase {
  constructor(
    ctx: ClientCtx,
    asset: Asset,
    amount: bigint,
    private auth: Permit2Authorization,
  ) {
    super(ctx, asset, amount);
  }
  async verify(): Promise<void> {
    await verifyRequest(
      this.ctx,
      permit2Request(this.erc20Token(), this.amount, this.auth, undefined),
    );
  }
  async send(): Promise<DepositReceipt> {
    const token = this.erc20Token();
    return submit(
      this.ctx,
      permit2Request(token, this.amount, this.auth, undefined),
      TokenRoute.Permit2,
      this.auth.fromAddress,
      token,
      this.amount,
    );
  }
}

export class SelfFundedDeposit extends DepositBase {
  async approve(waitOptions?: TxReceiptWaitOptions) {
    if (this.asset.isNative) {
      throw new InvalidParamsError(
        "a native deposit needs no approval; its value rides with the " +
          "transaction",
      );
    }
    const gateway = await this.ctx.gateway();
    return gateway.approveErc20(this.asset.address, this.amount, waitOptions);
  }
  async send(waitOptions?: TxReceiptWaitOptions): Promise<DepositReceipt> {
    return sendSelfFunded(this.ctx, this.asset, this.amount, waitOptions);
  }
}

async function sendEip3009(
  ctx: ClientCtx,
  token: string,
  amount: bigint,
): Promise<DepositReceipt> {
  const authorization = await sig.eip3009Authorization(ctx, token, amount);
  return submit(
    ctx,
    eip3009Request(token, amount, authorization),
    TokenRoute.Eip3009,
    authorization.fromAddress,
    token,
    amount,
  );
}

async function sendSponsoredPermit2(
  ctx: ClientCtx,
  token: string,
  amount: bigint,
): Promise<DepositReceipt> {
  const authorization = await sig.permit2Authorization(ctx, token, amount);
  try {
    return await submit(
      ctx,
      permit2Request(token, amount, authorization, undefined),
      TokenRoute.Permit2,
      authorization.fromAddress,
      token,
      amount,
    );
  } catch (rejection) {
    if (
      !(rejection instanceof Permit2AllowanceRequiredError) ||
      rejection.eip2612Nonce === undefined
    ) {
      throw rejection;
    }

    let permit: Eip2612Permit;
    try {
      permit = await sig.eip2612Permit(ctx, token, rejection.eip2612Nonce);
    } catch (err) {
      if (err instanceof MissingTokenDomainSeparatorError) {
        throw new Permit2AllowanceRequiredError(rejection.reason);
      }
      throw err;
    }

    return submit(
      ctx,
      permit2Request(token, amount, authorization, permit),
      TokenRoute.SponsoredPermit2,
      authorization.fromAddress,
      token,
      amount,
    );
  }
}

async function sendSelfFunded(
  ctx: ClientCtx,
  asset: Asset,
  amount: bigint,
  waitOptions?: TxReceiptWaitOptions,
): Promise<DepositReceipt> {
  const gateway = await ctx.gateway();
  if (!asset.isNative) {
    const allowance = await gateway.erc20Allowance(
      asset.address,
      ctx.contractAddress,
    );
    if (allowance < amount) {
      throw new Erc20AllowanceRequiredError({
        token: asset.address,
        spender: ctx.contractAddress,
        allowance,
        needed: amount,
      });
    }
  }
  const receipt = await gateway.deposit(amount, asset.erc20Token, waitOptions);
  return {
    txHash: receipt.transactionHash,
    route: TokenRoute.SelfFunded,
    account: ctx.signerAddress,
    asset: asset.address,
    amount,
    raw: receipt,
  };
}

function eip3009Request(
  token: string,
  amount: bigint,
  authorization: ReceiveAuthorization,
): Record<string, unknown> {
  return {
    asset: token,
    amount: amount.toString(),
    assetTransferMethod: "eip3009",
    authorization: authorization.toPayload(),
  };
}

function permit2Request(
  token: string,
  amount: bigint,
  authorization: Permit2Authorization,
  permit: Eip2612Permit | undefined,
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    asset: token,
    amount: amount.toString(),
    assetTransferMethod: "permit2",
    permit2Authorization: authorization.toPayload(),
  };
  if (permit !== undefined) {
    request.eip2612Permit = permit.toPayload();
  }
  return request;
}

async function submit(
  ctx: ClientCtx,
  request: Record<string, unknown>,
  route: TokenRoute,
  payer: string,
  asset: string,
  amount: bigint,
): Promise<DepositReceipt> {
  const response = await ctx.facilitator.post("deposit", request);
  if (!response.success) {
    throw rejectionError(response, response.error);
  }

  const txHash = response.txHash;
  if (typeof txHash !== "string" || !txHash.startsWith("0x")) {
    throw new OutcomeUnknownError(
      "facilitator reported success without a txHash",
    );
  }

  const echoedAmount = response.amount;
  if (echoedAmount !== null && echoedAmount !== undefined) {
    let parsedAmount: bigint | undefined;
    try {
      parsedAmount = BigInt(String(echoedAmount));
    } catch {
      parsedAmount = undefined;
    }
    if (parsedAmount !== amount) {
      throw new OutcomeUnknownError(
        `facilitator echoed amount ${echoedAmount}, expected ${amount}`,
      );
    }
  }

  return {
    txHash,
    route,
    account: confirmFacilitatorEcho("from", response.from, payer),
    asset: confirmFacilitatorEcho("asset", response.asset, asset),
    amount,
    network:
      typeof response.network === "string" ? response.network : undefined,
    raw: response,
  };
}

async function verifyRequest(
  ctx: ClientCtx,
  request: Record<string, unknown>,
): Promise<void> {
  const response = await ctx.facilitator.post("deposit/verify", request);
  if (response.isValid) {
    return;
  }
  throw rejectionError(response, response.invalidReason);
}

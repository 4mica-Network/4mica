/**
 * Entry point to the SDK.
 *
 * Each field is an intent-builder client: an entry captures what to do
 * (`client.deposit.of(...)`), a route pin narrows how (`.selfFunded()`),
 * and a terminal does it (`.send()`, `.approve()`, `.action()`).
 */

import type { AuthTokens } from "@/auth";
import { AccountClient } from "@/client/account";
import { ClientCtx } from "@/client/ctx";
import { DepositClient } from "@/client/deposit";
import type { Asset } from "@/client/model";
import { PaymentClient } from "@/client/payment";
import { SettlementClient } from "@/client/settlement";
import { TokensClient } from "@/client/tokens";
import { WithdrawClient } from "@/client/withdraw";
import type { Config } from "@/config";
import type {
  CorePublicParameters,
  PaymentRequest,
  PaymentRequestPayload,
} from "@/models";

export { AccountClient } from "@/client/account";
export { type ActiveCycle, ClientCtx } from "@/client/ctx";
export {
  AuthorizedEip3009Deposit,
  AuthorizedPermit2Deposit,
  DepositBuilder,
  DepositClient,
  Eip3009Deposit,
  GaslessDeposit,
  Permit2Deposit,
  SelfFundedDeposit,
  SponsoredPermit2Deposit,
} from "@/client/deposit";
export {
  confirmFacilitatorEcho,
  Facilitator,
  NAMES_THE_CLAIM,
  NAMES_THE_PAYMENT,
  NAMES_THE_REQUEST,
  refusesTheAuthorization,
  rejectionError,
  sponsorshipUnavailable,
} from "@/client/facilitator";
export * from "@/client/model";
export {
  type AssetLike,
  checkpointPayload,
  PaymentClient,
} from "@/client/payment";
export {
  AuthorizedPay,
  ClaimBuilder,
  Eip3009Pay,
  GaslessClaim,
  GaslessPay,
  PayBuilder,
  Permit2Pay,
  SelfFundedClaim,
  SelfFundedPay,
  SettlementClient,
  SponsoredPermit2Pay,
} from "@/client/settlement";
export * as sig from "@/client/sig";
export { TokensClient } from "@/client/tokens";
export {
  AuthorizedCancel,
  AuthorizedRequest,
  CancelBuilder,
  FinalizeBuilder,
  GaslessCancel,
  GaslessFinalize,
  GaslessRequest,
  RequestBuilder,
  SelfFundedCancel,
  SelfFundedFinalize,
  SelfFundedRequest,
  WithdrawClient,
} from "@/client/withdraw";

/**
 * A connected 4Mica client. Build a {@link Config} with
 * {@link ConfigBuilder}, then `await Client.connect(cfg)` — construction
 * reaches core for its public parameters, which is why it is async and
 * fallible.
 *
 * @example
 * ```ts
 * const cfg = new ConfigBuilder().walletPrivateKey("0x...").build();
 * const client = await Client.connect(cfg);
 * try {
 *   const claims = PaymentGuaranteeRequestClaims.new(...);
 *   const signature = await client.payment.signRequest(claims);
 * } finally {
 *   await client.aclose();
 * }
 * ```
 */
export class Client {
  /** Depositing collateral. */
  readonly deposit: DepositClient;
  /** Requesting, cancelling and finalizing withdrawals. */
  readonly withdraw: WithdrawClient;
  /** Signing, issuing and verifying payment guarantees. */
  readonly payment: PaymentClient;
  /** Settling a clearing cycle, from either side. */
  readonly settlement: SettlementClient;
  /** Reading the signer's own balances and positions. */
  readonly account: AccountClient;
  /** Supported-token metadata and ERC-20 approvals. */
  readonly tokens: TokensClient;
  /** Shared connection state, exposed for advanced use (e.g. `ctx.rpc`). */
  readonly ctx: ClientCtx;

  private constructor(ctx: ClientCtx) {
    this.ctx = ctx;
    this.deposit = new DepositClient(ctx);
    this.withdraw = new WithdrawClient(ctx);
    this.payment = new PaymentClient(ctx);
    this.settlement = new SettlementClient(ctx);
    this.account = new AccountClient(ctx);
    this.tokens = new TokensClient(ctx);
  }

  static async connect(cfg: Config): Promise<Client> {
    return new Client(await ClientCtx.create(cfg));
  }

  /** Low-level RPC proxy to the 4Mica core service. */
  get rpc() {
    return this.ctx.rpc;
  }

  /**
   * The address this client signs as, and therefore the account every
   * deposit credits.
   */
  get signerAddress(): string {
    return this.ctx.signerAddress;
  }

  /** Core's public parameters, as fetched at connect time. */
  get publicParams(): CorePublicParameters {
    return this.ctx.publicParams;
  }

  /**
   * Perform an explicit SIWE login and return the resulting tokens.
   *
   * Not required for normal operation — the first authenticated RPC call
   * triggers auth automatically. Call this to pre-warm the session.
   */
  async login(): Promise<AuthTokens> {
    return this.ctx.login();
  }

  async logout(): Promise<void> {
    return this.ctx.logout();
  }

  /**
   * A payment scoped to the live settlement cycle — half of the `FlowSigner`
   * surface {@link X402Flow} consumes.
   */
  async newPayment(
    recipient: string,
    amount: bigint | number | string,
    asset?: Asset | string | null,
  ): Promise<PaymentRequestPayload> {
    return this.payment.newPayment(recipient, amount, asset);
  }

  /** Sign a payment as the payer — the other half of `FlowSigner`. */
  async signPayment(payload: PaymentRequestPayload): Promise<PaymentRequest> {
    return this.payment.signRequest(payload);
  }

  /** Release client resources. Safe to call multiple times. */
  async aclose(): Promise<void> {
    await this.ctx.aclose();
  }
}

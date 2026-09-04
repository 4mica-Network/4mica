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
import { PaymentClient } from "@/client/payment";
import { SettlementClient } from "@/client/settlement";
import { TokensClient } from "@/client/tokens";
import { WithdrawClient } from "@/client/withdraw";
import type { Config } from "@/config";
import type {
  CorePublicParameters,
  PaymentGuaranteeRequestClaims,
  PaymentSignature,
} from "@/models";
import { SigningScheme } from "@/models";

export { AccountClient } from "@/client/account";
export { ClientCtx } from "@/client/ctx";
export {
  DepositBuilder,
  DepositClient,
  SelfFundedDeposit,
} from "@/client/deposit";
export * from "@/client/model";
export { PaymentClient } from "@/client/payment";
export {
  ClaimBuilder,
  PayBuilder,
  SelfFundedClaim,
  SelfFundedPay,
  SettlementClient,
} from "@/client/settlement";
export { TokensClient } from "@/client/tokens";
export { WithdrawClient, WithdrawStepBuilder } from "@/client/withdraw";

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
   * Sign a guarantee request as the payer — the `FlowSigner` surface
   * {@link X402Flow} consumes.
   */
  async signPayment(
    claims: PaymentGuaranteeRequestClaims,
    scheme: SigningScheme = SigningScheme.EIP712,
  ): Promise<PaymentSignature> {
    return this.payment.signRequest(claims, scheme);
  }

  /** Release client resources. Safe to call multiple times. */
  async aclose(): Promise<void> {
    await this.ctx.aclose();
  }
}

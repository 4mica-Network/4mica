import type { AuthTokens } from "@/auth";
import { AuthSession } from "@/auth";
import { RecipientClient } from "@/client/recipient";
import { UserClient } from "@/client/user";
import type { Config } from "@/config";
import { ContractGateway } from "@/contract";
import { AuthMissingConfigError } from "@/errors";
import type { CorePublicParameters } from "@/models";
import { resolvePublicRpcUrl } from "@/networks";
import { RpcProxy } from "@/rpc";
import { PaymentSigner } from "@/signing";

/**
 * Top-level SDK client. Holds a live connection to the 4Mica core RPC and the
 * on-chain Core4Mica contract. Obtain an instance via {@link Client.new}.
 *
 * @example
 * ```ts
 * const cfg = new ConfigBuilder().walletPrivateKey("0x...").build();
 * const client = await Client.new(cfg);
 * try {
 *   // client.user  – payer-side operations
 *   // client.recipient – recipient-side operations
 * } finally {
 *   await client.aclose();
 * }
 * ```
 */
export class Client {
  /** Low-level RPC proxy to the 4Mica core service. */
  readonly rpc: RpcProxy;
  /** Chain and contract parameters fetched from the core service at startup. */
  readonly params: CorePublicParameters;
  /** viem-backed gateway for on-chain calls (deposit, claimNetCredit, …). */
  readonly gateway: ContractGateway;
  /** 32-byte domain separator used to verify V1 BLS guarantee certificates. */
  readonly guaranteeDomain: string;
  /** Payer-side operations: deposit, sign, withdraw. */
  readonly user: UserClient;
  /** Recipient-side operations: guarantees, remuneration. */
  readonly recipient: RecipientClient;
  /** Payment signing wrapper around the configured viem Account. */
  readonly signer: PaymentSigner;
  private authSession?: AuthSession;

  private constructor(
    rpc: RpcProxy,
    params: CorePublicParameters,
    gateway: ContractGateway,
    guaranteeDomain: string,
    signer: PaymentSigner,
    authSession?: AuthSession,
  ) {
    this.rpc = rpc;
    this.params = params;
    this.gateway = gateway;
    this.guaranteeDomain = guaranteeDomain;
    this.signer = signer;
    this.authSession = authSession;
    this.user = new UserClient(this);
    this.recipient = new RecipientClient(this);
  }

  /**
   * Create and fully initialise a Client.
   *
   * Fetches public parameters from the core service, validates that the
   * Ethereum RPC is on the expected chain, and sets up SIWE auth if configured.
   *
   * @param cfg - Validated configuration produced by {@link ConfigBuilder.build}.
   * @throws {@link ConfigError} if the configuration is invalid.
   * @throws {@link RpcError} if the core service is unreachable.
   * @throws {@link ContractError} if the Ethereum RPC returns the wrong chain ID.
   */
  static async new(cfg: Config): Promise<Client> {
    const rpc = new RpcProxy(cfg.rpcUrl, cfg.adminApiKey);
    const params = await rpc.getPublicParams();
    const gateway = await Client.buildGateway(cfg, params);

    const guaranteeDomain = await gateway.getGuaranteeDomain();
    const signer = new PaymentSigner(cfg.signer);

    const authEnabled =
      cfg.authUrl !== undefined || cfg.authRefreshMarginSecs !== undefined;
    const authSession =
      cfg.bearerToken || !authEnabled
        ? undefined
        : new AuthSession({
            authUrl: cfg.authUrl ?? cfg.rpcUrl,
            signer: cfg.signer,
            refreshMarginSecs: cfg.authRefreshMarginSecs ?? 60,
          });

    if (cfg.bearerToken) {
      rpc.withBearerToken(cfg.bearerToken);
    } else if (authSession) {
      rpc.withTokenProvider(() => authSession.accessToken());
    }
    return new Client(
      rpc,
      params,
      gateway,
      guaranteeDomain,
      signer,
      authSession,
    );
  }

  private static async buildGateway(
    cfg: Config,
    params: CorePublicParameters,
  ): Promise<ContractGateway> {
    const ethRpcUrl =
      cfg.ethereumHttpRpcUrl ??
      params.ethereumHttpRpcUrl ??
      resolvePublicRpcUrl(`eip155:${params.chainId}`);
    const contractAddress = cfg.contractAddress ?? params.contractAddress;
    return ContractGateway.create(
      ethRpcUrl,
      cfg.signer,
      contractAddress as `0x${string}`,
      params.chainId,
    );
  }

  /**
   * Release client resources. Safe to call multiple times.
   * Use in a `finally` block to ensure cleanup after use.
   */
  async aclose(): Promise<void> {
    await this.rpc.aclose();
  }

  /**
   * Perform an explicit SIWE login and return the resulting tokens.
   *
   * Not required for normal operation — the first authenticated RPC call
   * triggers auth automatically. Call this to pre-warm the session.
   *
   * @throws {@link AuthMissingConfigError} if auth was not enabled in the config.
   */
  async login(): Promise<AuthTokens> {
    if (!this.authSession) {
      throw new AuthMissingConfigError("auth is not enabled");
    }
    return this.authSession.login();
  }
}

export { RecipientClient } from "@/client/recipient";
export { UserClient } from "@/client/user";

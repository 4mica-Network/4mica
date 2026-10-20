import type { Account, Hex } from "viem";
import { AuthSession, type AuthTokens } from "@/auth";
import { Facilitator } from "@/client/facilitator";
import type { Config } from "@/config";
import { ContractGateway } from "@/contract";
import {
  coreDomainSeparator as deriveCoreDomainSeparator,
  permit2DomainSeparator,
} from "@/digest";
import {
  AuthMissingConfigError,
  ChainRpcUnavailableError,
  ClientInitializationError,
  MissingTokenDomainSeparatorError,
  SigningError,
} from "@/errors";
import {
  clearingHouseDomain,
  type FourMicaEip712Domain,
  guaranteeRegistryDomain,
} from "@/guarantee";
import { type CorePublicParameters, PAYMENT_PAYLOAD_VERSION } from "@/models";
import { RpcProxy } from "@/rpc";
import { PayerSigner } from "@/signing";
import { bytesFromHex, normalizeAddress, normalizeBytes32Hex } from "@/utils";

/** The settlement cycle a payment must be signed for, as core reports it. */
export interface ActiveCycle {
  /** On-chain bytes32 cycle id, 0x-prefixed hex. */
  id: string;
  /** Unix seconds; a payment stamped earlier is refused as stale. */
  periodStart: number;
  /** Unix seconds; core opens the next cycle from this moment on. */
  periodEnd: number;
}

/**
 * The ClearingHouse, the GuaranteeRegistry and the guarantee signer, which
 * every payment is signed or verified against — so a core that omits one is
 * refused at connect rather than at the first payment.
 */
function signingAddresses(params: CorePublicParameters): {
  clearingHouse: string;
  guaranteeRegistry: string;
  guaranteeSigner: string;
} {
  const resolve = (what: string, raw: string): string => {
    try {
      return normalizeAddress(raw);
    } catch {
      throw new ClientInitializationError(`${what}: invalid address: ${raw}`);
    }
  };
  return {
    clearingHouse: resolve(
      "clearing house address",
      params.clearingHouseAddress,
    ),
    guaranteeRegistry: resolve(
      "guarantee registry address",
      params.guaranteeRegistryAddress,
    ),
    guaranteeSigner: resolve("guarantee signer", params.guaranteeSigner),
  };
}

/**
 * Refuses a core that cannot read what this client signs, rather than letting
 * every payment fail later with a decode error.
 */
function requirePayloadVersionSupport(params: CorePublicParameters): void {
  if (
    params.supportedPaymentPayloadVersions.includes(PAYMENT_PAYLOAD_VERSION)
  ) {
    return;
  }
  throw new ClientInitializationError(
    `this client signs payment payload v${PAYMENT_PAYLOAD_VERSION}, which core ` +
      `does not accept (core accepts [${params.supportedPaymentPayloadVersions.join(", ")}]); ` +
      "upgrade core or downgrade the SDK",
  );
}

/** Shared state behind a connected {@link Client}. */
export class ClientCtx {
  readonly cfg: Config;
  readonly rpc: RpcProxy;
  readonly authSession?: AuthSession;
  readonly publicParams: CorePublicParameters;
  readonly contractAddress: string;
  readonly chainId: number;
  readonly ethereumHttpRpcUrl?: string;
  /** The address whose signature attests this operator's guarantee receipts. */
  readonly guaranteeSigner: string;
  /** The domain every payer-signed payload is verified under. */
  readonly clearingHouseDomain: FourMicaEip712Domain;
  /** The domain the operator's guarantee receipts are verified under. */
  readonly guaranteeDomain: FourMicaEip712Domain;
  readonly signer: Account;
  readonly payerSigner: PayerSigner;
  readonly facilitator: Facilitator;
  readonly coreDomainSeparator: Hex;
  readonly permit2DomainSeparator: Hex;
  private gatewayInstance?: ContractGateway;
  private gatewayPromise?: Promise<ContractGateway>;
  private tokenDomainSeparators = new Map<string, string>();
  private tokenDomainFetch?: Promise<void>;
  /**
   * The cycle each asset's payments are scoped to, held until its period
   * ends or core refuses a request signed against it.
   */
  private activeCycles = new Map<string, ActiveCycle>();
  /**
   * The latest checkpoint cutoff known per asset. A payment at or below it
   * can never be collected, so payments are held back past it.
   */
  private paymentCutoffs = new Map<string, number>();
  /**
   * Core's clock minus ours, in ms, taken as a lower bound: the last
   * `server_time` core reported, against when its answer arrived.
   */
  private clockOffsetMs = 0;

  private constructor(init: {
    cfg: Config;
    rpc: RpcProxy;
    authSession?: AuthSession;
    publicParams: CorePublicParameters;
    contractAddress: string;
    ethereumHttpRpcUrl?: string;
  }) {
    this.cfg = init.cfg;
    this.rpc = init.rpc;
    this.authSession = init.authSession;
    this.publicParams = init.publicParams;
    this.contractAddress = init.contractAddress;
    this.chainId = init.publicParams.chainId;
    this.ethereumHttpRpcUrl = init.ethereumHttpRpcUrl;
    const addresses = signingAddresses(init.publicParams);
    this.guaranteeSigner = addresses.guaranteeSigner;
    this.clearingHouseDomain = clearingHouseDomain(
      this.chainId,
      addresses.clearingHouse,
    );
    this.guaranteeDomain = guaranteeRegistryDomain(
      this.chainId,
      addresses.guaranteeRegistry,
    );
    this.signer = init.cfg.signer;
    this.payerSigner = new PayerSigner(init.cfg.signer);
    this.facilitator = new Facilitator(init.cfg.facilitatorUrl);
    this.coreDomainSeparator = init.publicParams.coreDomainSeparator
      ? (normalizeBytes32Hex(init.publicParams.coreDomainSeparator) as Hex)
      : deriveCoreDomainSeparator(this.chainId, this.contractAddress);
    this.permit2DomainSeparator = permit2DomainSeparator(this.chainId);
  }

  static async create(cfg: Config): Promise<ClientCtx> {
    const rpc = new RpcProxy(cfg.rpcUrl);
    let publicParams: CorePublicParameters;
    let contractAddress: string;
    let ethereumHttpRpcUrl: string | undefined;
    try {
      publicParams = await rpc.getPublicParams();
      requirePayloadVersionSupport(publicParams);
      signingAddresses(publicParams);

      contractAddress = normalizeAddress(
        cfg.contractAddress ?? publicParams.contractAddress,
      );
      ethereumHttpRpcUrl =
        cfg.ethereumHttpRpcUrl || publicParams.ethereumHttpRpcUrl || undefined;
    } catch (err) {
      await rpc.aclose();
      throw err;
    }

    let authSession: AuthSession | undefined;
    if (cfg.authUrl !== undefined) {
      const session = new AuthSession({
        authUrl: cfg.authUrl,
        signer: cfg.signer,
        refreshMarginSecs: cfg.authRefreshMarginSecs,
      });
      authSession = session;
      rpc.withTokenProvider(() => session.accessToken());
    } else if (cfg.bearerToken) {
      rpc.withBearerToken(cfg.bearerToken);
    }

    return new ClientCtx({
      cfg,
      rpc,
      authSession,
      publicParams,
      contractAddress,
      ethereumHttpRpcUrl,
    });
  }

  get signerAddress(): string {
    return normalizeAddress(this.signer.address);
  }

  /**
   * The cycle payments for `asset` must be signed for, fetched once and
   * reused until its period ends or {@link forgetActiveCycle} drops it.
   */
  async activeCycle(asset: string): Promise<ActiveCycle> {
    const key = normalizeAddress(asset);
    const cached = this.activeCycles.get(key);
    if (cached !== undefined && this.coreNow() < cached.periodEnd) {
      return cached;
    }
    const response = await this.rpc.getActiveCycle(key);
    this.recordCoreTime(response.serverTime);
    const cycle: ActiveCycle = {
      id: response.cycleId,
      periodStart: response.periodStart,
      periodEnd: response.periodEnd,
    };
    this.activeCycles.set(key, cycle);
    return cycle;
  }

  /** Drop the cached cycle for `asset`, so the next payment re-reads it. */
  forgetActiveCycle(asset: string): void {
    this.activeCycles.delete(normalizeAddress(asset));
  }

  recordPaymentCutoff(asset: string, cutoff: number): void {
    const key = normalizeAddress(asset);
    this.paymentCutoffs.set(
      key,
      Math.max(this.paymentCutoffs.get(key) ?? 0, Number(cutoff)),
    );
  }

  paymentCutoff(asset: string): number | undefined {
    return this.paymentCutoffs.get(normalizeAddress(asset));
  }

  /**
   * Learn core's clock from a `server_time` it just reported. Zero, from a
   * core that predates it, teaches nothing.
   */
  recordCoreTime(serverTime: number): void {
    if (!serverTime) return;
    // The report left core before it reached us and was truncated to the
    // second, so core was at least this far ahead. Erring low is the safe
    // side: core refuses a payment stamped even a second past its clock.
    this.clockOffsetMs = Number(serverTime) * 1000 - Date.now();
  }

  /** Core's clock as best known, in unix ms, never ahead of the real one. */
  coreNowMs(): number {
    return Math.max(Date.now() + this.clockOffsetMs, 0);
  }

  /** Core's clock as best known, in unix seconds. */
  coreNow(): number {
    return Math.floor(this.coreNowMs() / 1000);
  }

  /**
   * Sign a raw 32-byte digest with the configured account — what the gasless
   * authorization schemes need. Local viem accounts support this; a JSON-RPC
   * account does not, and is refused with a clear error.
   */
  async signHash(digest: Hex): Promise<Uint8Array> {
    const account = this.signer as Account & {
      sign?: (parameters: { hash: Hex }) => Promise<Hex>;
    };
    if (typeof account.sign !== "function") {
      throw new SigningError(
        "this account cannot sign raw digests (no sign({ hash }) support); " +
          "gasless authorizations need a local account",
      );
    }
    return bytesFromHex(await account.sign({ hash: digest }));
  }

  /**
   * A token's EIP-712 domain separator, memoised. Deliberately not an
   * `eth_call`: signing a gasless authorization must not require an Ethereum
   * RPC endpoint. A hit never goes stale; a miss refetches in case a new
   * asset has been registered.
   */
  async tokenDomainSeparator(token: string): Promise<string> {
    const checksum = normalizeAddress(token);
    const cached = this.tokenDomainSeparators.get(checksum);
    if (cached !== undefined) {
      return cached;
    }
    // Coalesce concurrent misses into one fetch.
    if (!this.tokenDomainFetch) {
      this.tokenDomainFetch = this.fetchTokenDomainSeparators().finally(() => {
        this.tokenDomainFetch = undefined;
      });
    }
    await this.tokenDomainFetch;
    const found = this.tokenDomainSeparators.get(checksum);
    if (found === undefined) {
      throw new MissingTokenDomainSeparatorError(checksum);
    }
    return found;
  }

  private async fetchTokenDomainSeparators(): Promise<void> {
    const tokens = await this.rpc.getSupportedTokens();
    for (const info of tokens.tokens) {
      if (!info.domainSeparator) {
        continue;
      }
      try {
        this.tokenDomainSeparators.set(
          normalizeAddress(info.address),
          normalizeBytes32Hex(info.domainSeparator),
        );
      } catch {
        // A malformed entry is skipped rather than poisoning the cache.
      }
    }
  }

  /**
   * The transaction gateway, connected on first use so a client that only
   * signs and calls the API never needs an Ethereum endpoint. The chain id is
   * checked here rather than at connect.
   */
  async gateway(): Promise<ContractGateway> {
    if (this.gatewayInstance) {
      return this.gatewayInstance;
    }
    if (!this.gatewayPromise) {
      const ethRpcUrl = this.ethereumHttpRpcUrl;
      if (!ethRpcUrl) {
        throw new ChainRpcUnavailableError();
      }
      this.gatewayPromise = ContractGateway.create(
        ethRpcUrl,
        this.signer,
        this.contractAddress as Hex,
        this.chainId,
      ).then(
        (gateway) => {
          this.gatewayInstance = gateway;
          return gateway;
        },
        (err) => {
          this.gatewayPromise = undefined;
          throw err;
        },
      );
    }
    return this.gatewayPromise;
  }

  async login(): Promise<AuthTokens> {
    if (!this.authSession) {
      throw new AuthMissingConfigError("auth is not configured");
    }
    return this.authSession.login();
  }

  async logout(): Promise<void> {
    if (this.authSession) {
      await this.authSession.logout();
    }
  }

  async aclose(): Promise<void> {
    await this.rpc.aclose();
    await this.facilitator.aclose();
  }
}

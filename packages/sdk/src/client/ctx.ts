/**
 * Everything the sub-clients share: configuration, connections, and the
 * metadata resolved once at connect time. Port of `sdk-rust/src/client/ctx.rs`.
 */

import {
  type Account,
  createPublicClient,
  getContract,
  type Hex,
  http,
} from "viem";
import { core4micaAbi } from "@/abi/core4mica";
import { AuthSession, type AuthTokens } from "@/auth";
import type { Config } from "@/config";
import { ContractGateway } from "@/contract";
import {
  AuthMissingConfigError,
  ChainRpcUnavailableError,
  ClientError,
  ClientInitializationError,
} from "@/errors";
import { type CorePublicParameters, GUARANTEE_CLAIMS_VERSION } from "@/models";
import { RpcProxy } from "@/rpc";
import { PaymentSigner } from "@/signing";
import {
  bytesFromHex,
  hexFromBytes,
  normalizeAddress,
  normalizeBytes32Hex,
} from "@/utils";

const BLS_G1_COMPRESSED_BYTES = 48;

/** Shared state behind a connected {@link Client}. */
export class ClientCtx {
  readonly cfg: Config;
  readonly rpc: RpcProxy;
  readonly authSession?: AuthSession;
  readonly publicParams: CorePublicParameters;
  readonly contractAddress: string;
  readonly chainId: number;
  /** Operator BLS public key (48-byte compressed G1). */
  readonly operatorPublicKey: Uint8Array;
  readonly ethereumHttpRpcUrl?: string;
  /** Domain separator guarantees are issued under at the current version. */
  readonly guaranteeDomain: Uint8Array;
  /** Domain separator per supported guarantee version. */
  readonly guaranteeDomains: Map<number, Uint8Array>;
  readonly signer: Account;
  readonly paymentSigner: PaymentSigner;
  private gatewayInstance?: ContractGateway;
  private gatewayPromise?: Promise<ContractGateway>;

  private constructor(init: {
    cfg: Config;
    rpc: RpcProxy;
    authSession?: AuthSession;
    publicParams: CorePublicParameters;
    contractAddress: string;
    ethereumHttpRpcUrl?: string;
    guaranteeDomain: Uint8Array;
    guaranteeDomains: Map<number, Uint8Array>;
  }) {
    this.cfg = init.cfg;
    this.rpc = init.rpc;
    this.authSession = init.authSession;
    this.publicParams = init.publicParams;
    this.contractAddress = init.contractAddress;
    this.chainId = init.publicParams.chainId;
    this.operatorPublicKey = init.publicParams.publicKey;
    this.ethereumHttpRpcUrl = init.ethereumHttpRpcUrl;
    this.guaranteeDomain = init.guaranteeDomain;
    this.guaranteeDomains = init.guaranteeDomains;
    this.signer = init.cfg.signer;
    this.paymentSigner = new PaymentSigner(init.cfg.signer);
  }

  static async create(cfg: Config): Promise<ClientCtx> {
    const rpc = new RpcProxy(cfg.rpcUrl);
    let publicParams: CorePublicParameters;
    let contractAddress: string;
    let ethereumHttpRpcUrl: string | undefined;
    let guaranteeDomain: Uint8Array;
    let guaranteeDomains: Map<number, Uint8Array>;
    try {
      // Bootstrap stays unauthenticated: public-params is a public route, so
      // fetching it must never trigger a SIWE login.
      publicParams = await rpc.getPublicParams();

      if (publicParams.publicKey.length !== BLS_G1_COMPRESSED_BYTES) {
        throw new ClientInitializationError(
          "invalid operator public key: expected " +
            `${BLS_G1_COMPRESSED_BYTES} bytes, got ` +
            `${publicParams.publicKey.length}`,
        );
      }

      contractAddress = normalizeAddress(
        cfg.contractAddress ?? publicParams.contractAddress,
      );
      ethereumHttpRpcUrl =
        cfg.ethereumHttpRpcUrl || publicParams.ethereumHttpRpcUrl || undefined;

      ({ guaranteeDomain, guaranteeDomains } =
        await ClientCtx.fetchGuaranteeMetadata(
          publicParams,
          contractAddress,
          ethereumHttpRpcUrl,
        ));
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
      guaranteeDomain,
      guaranteeDomains,
    });
  }

  /**
   * The domain separator for every guarantee version this deployment supports,
   * so certs can be verified whichever version issued them. Requests are
   * always signed at {@link GUARANTEE_CLAIMS_VERSION}, so that one must be
   * supported and enabled.
   *
   * Takes what core publishes and reads the contract only when core publishes
   * nothing — the one path here that needs an Ethereum endpoint.
   */
  private static async fetchGuaranteeMetadata(
    publicParams: CorePublicParameters,
    contractAddress: string,
    ethereumHttpRpcUrl: string | undefined,
  ): Promise<{
    guaranteeDomain: Uint8Array;
    guaranteeDomains: Map<number, Uint8Array>;
  }> {
    if (
      !publicParams.supportedGuaranteeVersions.includes(
        GUARANTEE_CLAIMS_VERSION,
      )
    ) {
      throw new ClientInitializationError(
        `this client signs guarantee v${GUARANTEE_CLAIMS_VERSION}, which ` +
          "core does not support (core supports " +
          `[${publicParams.supportedGuaranteeVersions.join(", ")}]); ` +
          "upgrade core or downgrade the SDK",
      );
    }

    let guaranteeDomains: Map<number, Uint8Array>;
    if (publicParams.guaranteeDomains.length > 0) {
      guaranteeDomains = new Map(
        publicParams.guaranteeDomains.map((entry) => [
          entry.version,
          bytesFromHex(entry.domainSeparator),
        ]),
      );
    } else {
      guaranteeDomains = await ClientCtx.readGuaranteeDomains(
        publicParams,
        contractAddress,
        ethereumHttpRpcUrl,
      );
    }

    const guaranteeDomain = guaranteeDomains.get(GUARANTEE_CLAIMS_VERSION);
    if (guaranteeDomain === undefined) {
      throw new ClientInitializationError(
        `missing guarantee domain metadata for v${GUARANTEE_CLAIMS_VERSION}`,
      );
    }
    return { guaranteeDomain, guaranteeDomains };
  }

  /**
   * Read each supported version's domain off the contract, one call apiece —
   * the fallback for a core too old to publish them.
   */
  private static async readGuaranteeDomains(
    publicParams: CorePublicParameters,
    contractAddress: string,
    ethereumHttpRpcUrl: string | undefined,
  ): Promise<Map<number, Uint8Array>> {
    if (!ethereumHttpRpcUrl) {
      throw new ChainRpcUnavailableError();
    }

    const publicClient = createPublicClient({
      transport: http(ethereumHttpRpcUrl),
    });
    const contract = getContract({
      address: contractAddress as Hex,
      abi: core4micaAbi,
      client: { public: publicClient },
    });

    const expected = publicParams.guaranteeDomainSeparator
      ? normalizeBytes32Hex(publicParams.guaranteeDomainSeparator)
      : undefined;

    const domains = new Map<number, Uint8Array>();
    try {
      for (const version of publicParams.supportedGuaranteeVersions) {
        const [, domainSeparator, , enabled] =
          await contract.read.getGuaranteeVersionConfig([BigInt(version)]);
        const domain = bytesFromHex(domainSeparator as string);

        if (!enabled) {
          if (version === GUARANTEE_CLAIMS_VERSION) {
            throw new ClientInitializationError(
              `guarantee v${GUARANTEE_CLAIMS_VERSION} is disabled on-chain`,
            );
          }
          continue;
        }
        domains.set(version, domain);

        if (
          version === GUARANTEE_CLAIMS_VERSION &&
          expected !== undefined &&
          expected !== hexFromBytes(domain)
        ) {
          throw new ClientInitializationError(
            "guarantee domain mismatch between core metadata and contract " +
              `for version ${version}`,
          );
        }
      }
    } catch (err) {
      if (err instanceof ClientError) {
        throw err;
      }
      throw new ClientInitializationError(
        err instanceof Error ? err.message : String(err),
      );
    }

    return domains;
  }

  get signerAddress(): string {
    return normalizeAddress(this.signer.address);
  }

  guaranteeDomainForVersion(version: number): Uint8Array | undefined {
    return this.guaranteeDomains.get(Number(version));
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
  }
}

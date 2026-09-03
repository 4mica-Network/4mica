import { type Account, privateKeyToAccount } from "viem/accounts";
import type { Config } from "@/config/models";
import { ConfigError } from "@/errors";
import { resolveNetworkRpcUrl } from "@/networks";
import {
  normalizeAddress,
  normalizePrivateKey,
  ValidationError,
  validateUrl,
} from "@/utils";

export type { Config } from "@/config/models";

export const DEFAULT_RPC_URL = "https://ethereum.sepolia.api.4mica.xyz/";

/**
 * Fluent builder for {@link Config}; hand the result to `Client.connect`.
 * SIWE auth is on by default; a bearer token replaces it.
 *
 * @example
 * ```ts
 * const cfg = new ConfigBuilder()
 *   .walletPrivateKey('0x...')
 *   .build();
 * ```
 *
 * All fields can also be supplied from environment variables via {@link fromEnv}.
 */
export class ConfigBuilder {
  private _rpcUrl: string | undefined = DEFAULT_RPC_URL;
  private _walletPrivateKey: string | undefined;
  private _signer: Account | undefined;
  private _ethereumHttpRpcUrl?: string;
  private _contractAddress?: string;
  private _bearerToken?: string;
  private _authEnabled = true;
  private _authUrl?: string;
  private _authRefreshMarginSecs?: number;
  private _facilitatorUrl?: string;

  /** Set the 4Mica core RPC URL directly. Use {@link network} to select a hosted network by name instead. Defaults to `https://ethereum.sepolia.api.4mica.xyz/`. */
  rpcUrl(value: string): ConfigBuilder {
    this._rpcUrl = value;
    return this;
  }

  /**
   * Select a hosted 4Mica network by shorthand or CAIP-2 identifier.
   * Resolves to the corresponding core API URL.
   * Mutually exclusive with {@link rpcUrl} — last call wins.
   *
   * Supported values: `"base"` / `"eip155:8453"`, `"base-sepolia"` / `"eip155:84532"`,
   * `"ethereum-sepolia"` / `"eip155:11155111"`.
   *
   * @throws {@link ConfigError} if the network is not recognised.
   */
  network(value: string): ConfigBuilder {
    const url = resolveNetworkRpcUrl(value);
    if (!url) {
      throw new ConfigError(
        `unknown network "${value}". Use a known shorthand (e.g. "base") or CAIP-2 id, or call rpcUrl() directly.`,
      );
    }
    this._rpcUrl = url;
    return this;
  }

  /** Set the wallet private key (hex string). Mutually exclusive with {@link signer}. */
  walletPrivateKey(value: string): ConfigBuilder {
    this._walletPrivateKey = value;
    return this;
  }

  /** Set a pre-built viem `Account` directly. Mutually exclusive with {@link walletPrivateKey}. */
  signer(value: Account): ConfigBuilder {
    this._signer = value;
    return this;
  }

  /**
   * Ethereum endpoint for on-chain reads and self-funded transactions.
   * Normally unnecessary: core advertises one.
   */
  ethereumHttpRpcUrl(value: string): ConfigBuilder {
    this._ethereumHttpRpcUrl = value;
    return this;
  }

  /** Override the Core4Mica contract address. Normally unnecessary: core advertises the deployment. */
  contractAddress(value: string): ConfigBuilder {
    this._contractAddress = value;
    return this;
  }

  /** Facilitator that sponsors gas. Without one, every operation is self-funded. */
  facilitatorUrl(value: string): ConfigBuilder {
    this._facilitatorUrl = value;
    return this;
  }

  /** Set a static bearer token for authenticated RPC calls. Disables SIWE auth. */
  bearerToken(value: string): ConfigBuilder {
    this._bearerToken = value;
    return this;
  }

  /** Enable SIWE authentication (the default). */
  enableAuth(): ConfigBuilder {
    this._authEnabled = true;
    return this;
  }

  /**
   * Disable SIWE authentication entirely. Requests carry no credentials;
   * only public routes will answer.
   */
  disableAuth(): ConfigBuilder {
    this._authEnabled = false;
    return this;
  }

  /** Set a custom SIWE authentication endpoint and enable auth. Defaults to the RPC URL. */
  authUrl(value: string): ConfigBuilder {
    this._authUrl = value;
    this._authEnabled = true;
    return this;
  }

  /** Set the number of seconds before token expiry at which the session proactively refreshes. Enables auth. */
  authRefreshMarginSecs(value: number): ConfigBuilder {
    this._authRefreshMarginSecs = value;
    this._authEnabled = true;
    return this;
  }

  /**
   * Load configuration from environment variables.
   *
   * Recognised variables:
   * - `4MICA_NETWORK` — shorthand or CAIP-2 id (e.g. `base`); takes precedence over `4MICA_RPC_URL`
   * - `4MICA_RPC_URL`
   * - `4MICA_WALLET_PRIVATE_KEY`
   * - `4MICA_ETHEREUM_HTTP_RPC_URL`
   * - `4MICA_CONTRACT_ADDRESS`
   * - `4MICA_FACILITATOR_URL`
   * - `4MICA_BEARER_TOKEN`
   * - `4MICA_AUTH_URL`
   * - `4MICA_AUTH_REFRESH_MARGIN_SECS`
   *
   * @param source - Environment source to read from. Defaults to `process.env`
   *   when available (Node/Bun) and an empty object otherwise. Runtime adapters
   *   (`@4mica/sdk-node`, `@4mica/sdk-deno`, …) pass their runtime's env here so
   *   the core stays free of any hard `process` reference.
   */
  fromEnv(source?: Record<string, string | undefined>): ConfigBuilder {
    const env =
      source ??
      (globalThis as { process?: { env?: Record<string, string | undefined> } })
        .process?.env ??
      {};
    if (env["4MICA_NETWORK"]) this.network(env["4MICA_NETWORK"]);
    else if (env["4MICA_RPC_URL"]) this._rpcUrl = env["4MICA_RPC_URL"];
    if (env["4MICA_WALLET_PRIVATE_KEY"])
      this._walletPrivateKey = env["4MICA_WALLET_PRIVATE_KEY"];
    if (env["4MICA_ETHEREUM_HTTP_RPC_URL"])
      this._ethereumHttpRpcUrl = env["4MICA_ETHEREUM_HTTP_RPC_URL"];
    if (env["4MICA_CONTRACT_ADDRESS"])
      this._contractAddress = env["4MICA_CONTRACT_ADDRESS"];
    if (env["4MICA_FACILITATOR_URL"])
      this._facilitatorUrl = env["4MICA_FACILITATOR_URL"];
    if (env["4MICA_BEARER_TOKEN"])
      this._bearerToken = env["4MICA_BEARER_TOKEN"];
    if (env["4MICA_AUTH_URL"]) {
      this._authUrl = env["4MICA_AUTH_URL"];
      this._authEnabled = true;
    }
    if (env["4MICA_AUTH_REFRESH_MARGIN_SECS"]) {
      this._authRefreshMarginSecs = Number(
        env["4MICA_AUTH_REFRESH_MARGIN_SECS"],
      );
      this._authEnabled = true;
    }
    return this;
  }

  /**
   * Validate all settings and return an immutable {@link Config}.
   *
   * @throws {@link ConfigError} if required fields are missing, URLs are invalid,
   *   or the auth refresh margin is not a finite non-negative number.
   */
  build(): Config {
    if (!this._signer && !this._walletPrivateKey) {
      throw new ConfigError("missing signer or wallet_private_key");
    }
    if (!this._rpcUrl) {
      throw new ConfigError("missing rpc_url");
    }

    try {
      const rpcUrl = validateUrl(this._rpcUrl);
      const walletPrivateKey = this._walletPrivateKey
        ? normalizePrivateKey(this._walletPrivateKey)
        : undefined;

      const signer: Account =
        this._signer ?? privateKeyToAccount(walletPrivateKey as `0x${string}`);

      const ethereumHttpRpcUrl = this._ethereumHttpRpcUrl
        ? validateUrl(this._ethereumHttpRpcUrl)
        : undefined;
      const contractAddress = this._contractAddress
        ? normalizeAddress(this._contractAddress)
        : undefined;
      const facilitatorUrl = this._facilitatorUrl
        ? validateUrl(this._facilitatorUrl)
        : undefined;
      const refreshMargin = this._authRefreshMarginSecs ?? 60;
      if (!Number.isFinite(refreshMargin) || refreshMargin < 0) {
        throw new ValidationError("invalid auth refresh margin");
      }
      const authEnabled = this._authEnabled && !this._bearerToken;
      const authUrl = this._authUrl ? validateUrl(this._authUrl) : undefined;

      return {
        rpcUrl,
        signer,
        ethereumHttpRpcUrl,
        contractAddress,
        bearerToken: this._bearerToken,
        authUrl: authEnabled ? (authUrl ?? rpcUrl) : undefined,
        authRefreshMarginSecs: authEnabled ? refreshMargin : undefined,
        facilitatorUrl,
      };
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new ConfigError(err.message);
      }
      throw err;
    }
  }
}

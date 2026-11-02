import type { Account } from "viem/accounts";
import { type AmountInput, formatUnits } from "@/amounts";
import { Client } from "@/client";
import { type Config, ConfigBuilder } from "@/config";
import { defaultEnv, readEnv } from "@/config/env";
import { ClientError, ConfigError } from "@/errors";
import { deposit } from "@/facade/deposit";
import { payingFetch, SpendLimiter } from "@/facade/fetch";
import type {
  AssetRef,
  Balance,
  Balances,
  DepositOptions,
  DepositResult,
  FourMicaOptions,
  NetworkOption,
  PaymentRecord,
  PendingWithdrawal,
  WithdrawResult,
} from "@/facade/models";
import type { PaymentProtocol } from "@/facade/protocols/types";
import { x402Protocol } from "@/facade/protocols/x402";
import { assetRef, NetworkSession } from "@/facade/session";
import {
  cancelWithdrawal,
  finalizeWithdrawal,
  pendingWithdrawals,
  requestWithdrawal,
} from "@/facade/withdraw";
import { DEFAULT_NETWORK, NETWORKS, resolveNetwork } from "@/networks";

export type * from "@/facade/models";
export type { PaymentProtocol, PaymentTerms } from "@/facade/protocols/types";

const PROTOCOLS: Readonly<Record<string, PaymentProtocol>> = {
  x402: x402Protocol,
};

// Declared as `@types/node` does, so the emitted types also check against a
// `lib` without `esnext.disposable`; the two declarations merge.
declare global {
  interface SymbolConstructor {
    readonly asyncDispose: unique symbol;
  }
}

// Missing before Node 18.18; TypeScript's `await using` falls back to this.
const asyncDispose: typeof Symbol.asyncDispose =
  Symbol.asyncDispose ??
  (Symbol.for("Symbol.asyncDispose") as typeof Symbol.asyncDispose);

function homeConfig(options: FourMicaOptions): Config {
  const builder = new ConfigBuilder();
  let networkFromEnv = false;
  if (!options.privateKey && !options.signer) {
    const env = options.env ?? defaultEnv();
    if (!readEnv(env, "WALLET_PRIVATE_KEY")) {
      throw new ConfigError(
        "no signer: pass privateKey or signer to FourMica.connect, or set " +
          "FOURMICA_WALLET_PRIVATE_KEY",
      );
    }
    builder.fromEnv(env);
    networkFromEnv = !!(readEnv(env, "NETWORK") || readEnv(env, "RPC_URL"));
  }
  if (options.privateKey) builder.walletPrivateKey(options.privateKey);
  if (options.signer) builder.signer(options.signer);
  if (options.rpcUrl) builder.rpcUrl(options.rpcUrl);
  else if (options.network) builder.network(options.network);
  else if (!networkFromEnv) builder.network(DEFAULT_NETWORK);
  if (options.facilitatorUrl) builder.facilitatorUrl(options.facilitatorUrl);
  return builder.build();
}

async function connectSession(cfg: Config): Promise<NetworkSession> {
  const client = await Client.connect(cfg);
  const caip2 = `eip155:${client.ctx.chainId}`;
  const hosted = Object.entries(NETWORKS).find(
    ([, info]) => info.rpcUrl === cfg.rpcUrl,
  );
  return hosted
    ? new NetworkSession(hosted[0], caip2, hosted[1], client)
    : new NetworkSession(caip2, caip2, undefined, client);
}

function toBalance(asset: AssetRef, total: bigint, locked: bigint): Balance {
  const available = total > locked ? total - locked : 0n;
  return {
    asset,
    total: formatUnits(total, asset.decimals),
    locked: formatUnits(locked, asset.decimals),
    available: formatUnits(available, asset.decimals),
    raw: { total, locked, available },
  };
}

/**
 * Connect once, then deposit, pay and withdraw with amounts like `"5 USDC"`.
 * Each network the session touches gets its own `Client`, connected on first
 * use; `lowLevel()` returns it.
 */
export class FourMica {
  private readonly sessions = new Map<string, Promise<NetworkSession>>();
  private readonly payments = new WeakMap<Response, PaymentRecord>();
  private closed = false;

  private constructor(
    private readonly signer: Account,
    private readonly home: NetworkSession,
    private readonly protocols: readonly PaymentProtocol[],
    private readonly limiter: SpendLimiter,
    private readonly fetchFn: typeof fetch,
  ) {
    this.sessions.set(home.caip2, Promise.resolve(home));
  }

  static async connect(options: FourMicaOptions = {}): Promise<FourMica> {
    if (options.privateKey && options.signer) {
      throw new ConfigError("pass privateKey or signer, not both");
    }
    const protocols = (options.protocols ?? ["x402"]).map((name) => {
      const protocol = PROTOCOLS[name];
      if (!protocol) {
        throw new ConfigError(
          `unknown payment protocol "${name}"; known: ` +
            Object.keys(PROTOCOLS).join(", "),
        );
      }
      return protocol;
    });
    const limiter = new SpendLimiter(options.spend);
    const cfg = homeConfig(options);
    return new FourMica(
      cfg.signer,
      await connectSession(cfg),
      protocols,
      limiter,
      options.fetch ?? ((...args) => fetch(...args)),
    );
  }

  get address(): string {
    return this.home.client.signerAddress;
  }

  /** A hosted shorthand, or the CAIP-2 id of a self-hosted core. */
  get network(): string {
    return this.home.name;
  }

  private session(network?: string): Promise<NetworkSession> {
    if (this.closed) {
      return Promise.reject(new ClientError("this FourMica session is closed"));
    }
    if (network === undefined) return Promise.resolve(this.home);
    const resolved = resolveNetwork(network);
    if (!resolved) {
      if (network.trim().toLowerCase() === this.home.caip2) {
        return Promise.resolve(this.home);
      }
      return Promise.reject(
        new ConfigError(
          `unknown network "${network}"; use a hosted shorthand such as ` +
            '"base-sepolia" or a CAIP-2 id',
        ),
      );
    }
    const { caip2 } = resolved.info;
    let session = this.sessions.get(caip2);
    if (!session) {
      session = connectSession(
        new ConfigBuilder().signer(this.signer).network(resolved.name).build(),
      );
      session.catch(() => this.sessions.delete(caip2));
      this.sessions.set(caip2, session);
    }
    return session;
  }

  async lowLevel(network?: string): Promise<Client> {
    return (await this.session(network)).client;
  }

  async deposit(
    amount: AmountInput,
    options: DepositOptions = {},
  ): Promise<DepositResult> {
    return deposit(await this.session(options.network), amount, options);
  }

  /** Assets the wallet holds collateral in. */
  async balance(options?: NetworkOption): Promise<Balances>;
  async balance(asset: string, options?: NetworkOption): Promise<Balance>;
  async balance(
    assetOrOptions?: string | NetworkOption,
    maybeOptions: NetworkOption = {},
  ): Promise<Balance | Balances> {
    const single = typeof assetOrOptions === "string";
    const options = single ? maybeOptions : (assetOrOptions ?? {});
    const session = await this.session(options.network);

    const read = async (asset: AssetRef) => {
      const info = await session.client.rpc.getUserAssetBalance(
        session.client.signerAddress,
        asset.address,
      );
      return info && toBalance(asset, info.total, info.locked);
    };

    if (single) {
      const asset = assetRef(await session.token(assetOrOptions));
      return (await read(asset)) ?? toBalance(asset, 0n, 0n);
    }

    const assets = [
      assetRef(await session.token(session.nativeSymbol)),
      ...(await session.tokens()).map(assetRef),
    ];
    const balances: Balances = {};
    for (const balance of await Promise.all(assets.map(read))) {
      if (!balance) continue;
      const { symbol, address } = balance.asset;
      balances[symbol in balances ? address : symbol] = balance;
    }
    return balances;
  }

  /** Requests a withdrawal; `finalizeWithdrawal` pays it out after the grace period. */
  async withdraw(
    amount: AmountInput,
    options: NetworkOption = {},
  ): Promise<WithdrawResult> {
    return requestWithdrawal(await this.session(options.network), amount);
  }

  async finalizeWithdrawal(
    asset: string,
    options: NetworkOption = {},
  ): Promise<WithdrawResult> {
    return finalizeWithdrawal(await this.session(options.network), asset);
  }

  async cancelWithdrawal(
    asset: string,
    options: NetworkOption = {},
  ): Promise<WithdrawResult> {
    return cancelWithdrawal(await this.session(options.network), asset);
  }

  async withdrawals(options: NetworkOption = {}): Promise<PendingWithdrawal[]> {
    return pendingWithdrawals(await this.session(options.network));
  }

  /**
   * Pays a 4Mica 402 on a network this session has open, within the spend
   * limits, and retries once. Anything else comes back untouched.
   */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    await this.session();
    const open = new Map<string, NetworkSession>();
    for (const [caip2, pending] of this.sessions) {
      const session = await pending.catch(() => undefined);
      if (session) open.set(caip2, session);
    }
    return payingFetch(
      {
        fetchFn: this.fetchFn,
        protocols: this.protocols,
        sessionFor: (caip2) => open.get(caip2),
        limiter: this.limiter,
        record: (response, payment) => this.payments.set(response, payment),
      },
      input,
      init,
    );
  }

  paymentFor(response: Response): PaymentRecord | undefined {
    return this.payments.get(response);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const sessions = await Promise.all(
      [...this.sessions.values()].map((s) => s.catch(() => undefined)),
    );
    await Promise.all(sessions.map((s) => s?.client.aclose()));
  }

  async [asyncDispose](): Promise<void> {
    await this.close();
  }
}

import type { AmountSpec, ResolvedToken } from "@4mica/sdk/amounts";
import { fields } from "../ui/output.js";
import { formatAmount } from "./assets.js";
import type { withSession } from "./session.js";
import { networkName, type Settings } from "./settings.js";

type Client = Parameters<Parameters<typeof withSession>[1]>[0];

/** What `--dry-run` prints: the action, the facts it rests on, what blocks it. */
export interface Preview {
  dryRun: true;
  action: string;
  network: string;
  wallet: string;
  /** camelCase keys, for `--json`; `detailLines` gives the words. */
  details: Record<string, string>;
  /** Empty when the real command would be sent. */
  problems: string[];
  ready: boolean;
}

function preview(
  settings: Settings,
  client: Client,
  action: string,
  details: Record<string, string>,
  problems: string[],
): Preview {
  return {
    dryRun: true,
    action,
    network: networkName(settings),
    wallet: client.address,
    details,
    problems,
    ready: problems.length === 0,
  };
}

/** `baseUnits` → `base units`, as a person reads it. */
export const label = (key: string): string =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

/** The details as the terminal shows them. */
export const detailLines = (p: Preview): [string, string][] =>
  Object.entries(p.details).map(([key, value]) => [label(key), value]);

/** The preview as text. `NetworkCommand.showPreview` prints it. */
export function renderPreview(p: Preview): string {
  return fields([
    ["would", p.action],
    ["network", p.network],
    ["wallet", p.wallet],
    ...detailLines(p),
    ["ready", p.ready ? "yes, nothing was sent" : "no"],
    ...p.problems.map((problem): [string, string] => ["problem", problem]),
  ]);
}

/**
 * The checks the SDK's `deposit` makes before it signs anything: the token
 * resolves, the amount fits its decimals, the wallet holds enough, and there
 * is gas where the wallet has to pay it.
 *
 * shortcut: these mirror `packages/sdk/src/facade/deposit.ts` instead of
 * calling it, because the facade has no preview of its own. They belong
 * there, as one function `deposit` and a preview both use.
 */
export async function previewDeposit(
  settings: Settings,
  client: Client,
  amount: AmountSpec,
  gas: "auto" | "self",
): Promise<Preview> {
  const { formatUnits, resolveToken, toBaseUnits } = await import(
    "@4mica/sdk/amounts"
  );
  const low = await client.lowLevel();
  const nativeSymbol = settings.info?.nativeSymbol ?? "ETH";
  const { tokens } = await low.tokens.supported();
  const token = resolveToken(tokens, amount.asset, { nativeSymbol });
  const raw = toBaseUnits(amount.amount, token.decimals);

  const gateway = await low.ctx.gateway();
  const native = await gateway.nativeBalance();
  const held = token.native
    ? native
    : await gateway.erc20Balance(token.address);
  const sponsored =
    !token.native && gas === "auto" && low.deposit.isGaslessAvailable();

  const problems: string[] = [];
  if (raw === 0n) problems.push("the amount must be more than zero");
  if (held < raw) {
    problems.push(
      `the wallet holds ${formatUnits(held, token.decimals)} ${token.symbol}; ` +
        `this needs ${amount.amount}`,
    );
  } else if (token.native && held === raw) {
    problems.push(`depositing all of it leaves no ${nativeSymbol} for gas`);
  }
  if (!sponsored && !token.native && native === 0n) {
    problems.push(
      `the wallet pays for this transaction and holds no ${nativeSymbol}`,
    );
  }

  return preview(
    settings,
    client,
    `deposit ${amount.amount} ${token.symbol}`,
    {
      token: `${token.symbol} (${token.native ? "native" : token.address})`,
      baseUnits: raw.toString(),
      walletHolds: `${formatUnits(held, token.decimals)} ${token.symbol}`,
      gas: sponsored ? SPONSORED : await paidByWallet(native, nativeSymbol),
      contract: low.ctx.contractAddress,
    },
    problems,
  );
}

export async function previewWithdrawalRequest(
  settings: Settings,
  client: Client,
  amount: AmountSpec,
): Promise<Preview> {
  const { toBaseUnits } = await import("@4mica/sdk/amounts");
  const balance = await client.balance(amount.asset);
  const raw = toBaseUnits(amount.amount, balance.asset.decimals);
  const problems: string[] = [];
  if (raw === 0n) problems.push("the amount must be more than zero");
  if (balance.raw.available < raw) {
    problems.push(
      `only ${balance.available} ${balance.asset.symbol} is available; ` +
        `this needs ${amount.amount}`,
    );
  }
  return preview(
    settings,
    client,
    `request a withdrawal of ${amount.amount} ${balance.asset.symbol}`,
    {
      token: `${balance.asset.symbol} (${balance.asset.address})`,
      available: `${balance.available} ${balance.asset.symbol}`,
      locked: `${balance.locked} ${balance.asset.symbol}`,
      contract: (await client.lowLevel()).ctx.contractAddress,
    },
    problems,
  );
}

/** `finalize` needs a withdrawal that is ready; `cancel` needs one at all. */
export async function previewPendingWithdrawal(
  settings: Settings,
  client: Client,
  asset: string,
  verb: "finalize" | "cancel",
): Promise<Preview> {
  const wanted = asset.toLowerCase();
  const pending = (await client.withdrawals()).find(
    (w) =>
      w.asset.symbol.toLowerCase() === wanted ||
      w.asset.address.toLowerCase() === wanted,
  );
  const problems: string[] = [];
  if (!pending) {
    problems.push(`no withdrawal of ${asset} is pending`);
  } else if (verb === "finalize" && !pending.ready) {
    problems.push(`it can be finalized from ${pending.readyAt.toISOString()}`);
  }
  return preview(
    settings,
    client,
    `${verb} the withdrawal of ${pending?.asset.symbol ?? asset}`,
    pending
      ? {
          token: `${pending.asset.symbol} (${pending.asset.address})`,
          amount: `${pending.amount} ${pending.asset.symbol}`,
          requested: pending.requestedAt.toISOString(),
          readyAt: pending.readyAt.toISOString(),
          contract: (await client.lowLevel()).ctx.contractAddress,
        }
      : {},
    problems,
  );
}

/** What core says a cycle settles for: the part of its answer a preview reads. */
interface CycleTerms {
  cycleIdText: string;
  assetAddress: string;
  /** The contract that takes a debit, and so needs a token's allowance. */
  contractAddress: string;
  participant: string;
  amount: bigint;
}

const SPONSORED = "sponsored, if the facilitator accepts the request";

async function paidByWallet(native: bigint, nativeSymbol: string) {
  const { formatUnits } = await import("@4mica/sdk/amounts");
  return `paid by this wallet (${formatUnits(native, 18)} ${nativeSymbol})`;
}

/**
 * What stops `cycles pay` before anything is signed: the wallet not holding
 * the debit, and, where the wallet sends the transaction itself, no gas or
 * no allowance for the token.
 *
 * shortcut: mirrors the routing in `packages/sdk/src/client/settlement.ts`
 * (`PayBuilder.send`, `paySelfFunded`), which has no preview of its own.
 */
export async function previewCyclePay(
  settings: Settings,
  client: Client,
  terms: CycleTerms,
  assets: readonly ResolvedToken[],
  gas: "auto" | "self",
): Promise<Preview> {
  const low = await client.lowLevel();
  const nativeSymbol = settings.info?.nativeSymbol ?? "ETH";
  const nativeDebit = /^0x0+$/.test(terms.assetAddress);
  const gateway = await low.ctx.gateway();
  const native = await gateway.nativeBalance();
  const held = nativeDebit
    ? native
    : await gateway.erc20Balance(terms.assetAddress);
  const sponsored =
    !nativeDebit && gas === "auto" && low.settlement.isGaslessAvailable();
  const amount = await formatAmount(assets, terms.assetAddress, terms.amount);
  const holds = await formatAmount(assets, terms.assetAddress, held);

  const problems: string[] = [];
  if (held < terms.amount) {
    problems.push(`the wallet holds ${holds}; this needs ${amount}`);
  } else if (nativeDebit && held === terms.amount) {
    problems.push(`paying all of it leaves no ${nativeSymbol} for gas`);
  }
  if (!sponsored && !nativeDebit) {
    if (native === 0n) {
      problems.push(
        `the wallet pays for this transaction and holds no ${nativeSymbol}`,
      );
    }
    // `--gas self` approves the amount itself, before it pays.
    if (
      gas === "auto" &&
      (await gateway.erc20Allowance(
        terms.assetAddress,
        terms.contractAddress,
      )) < terms.amount
    ) {
      problems.push(
        "the wallet has not approved the token for this payment; " +
          "--gas self approves it first",
      );
    }
  }

  return preview(
    settings,
    client,
    `pay ${amount} for cycle ${terms.cycleIdText}`,
    {
      for: terms.participant,
      token: terms.assetAddress,
      baseUnits: terms.amount.toString(),
      walletHolds: holds,
      gas: sponsored ? SPONSORED : await paidByWallet(native, nativeSymbol),
      contract: terms.contractAddress,
    },
    problems,
  );
}

/**
 * A claim moves nothing out of the wallet, so the one thing this wallet can
 * lack is gas, when it sends the transaction itself.
 */
export async function previewCycleClaim(
  settings: Settings,
  client: Client,
  terms: CycleTerms,
  assets: readonly ResolvedToken[],
  gas: "auto" | "self",
): Promise<Preview> {
  const low = await client.lowLevel();
  const nativeSymbol = settings.info?.nativeSymbol ?? "ETH";
  const native = await (await low.ctx.gateway()).nativeBalance();
  const sponsored = gas === "auto" && low.settlement.isGaslessAvailable();
  const amount = await formatAmount(assets, terms.assetAddress, terms.amount);

  const problems: string[] = [];
  if (!sponsored && native === 0n) {
    problems.push(
      `the wallet pays for this transaction and holds no ${nativeSymbol}`,
    );
  }
  return preview(
    settings,
    client,
    `claim ${amount} for cycle ${terms.cycleIdText}`,
    {
      for: terms.participant,
      token: terms.assetAddress,
      baseUnits: terms.amount.toString(),
      gas: sponsored ? SPONSORED : await paidByWallet(native, nativeSymbol),
      contract: terms.contractAddress,
    },
    problems,
  );
}

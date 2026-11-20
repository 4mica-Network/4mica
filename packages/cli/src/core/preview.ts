import type { AmountSpec } from "@4mica/sdk/amounts";
import { fields } from "../ui/output.js";
import type { withSession } from "./session.js";
import { networkName, type Settings } from "./settings.js";

type Client = Parameters<Parameters<typeof withSession>[1]>[0];

/** What `--dry-run` prints: the action, the facts it rests on, what blocks it. */
export interface Preview {
  dryRun: true;
  action: string;
  network: string;
  wallet: string;
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

/** Exit code 1 when something blocks it, so a script can branch on a dry run. */
export function renderPreview(p: Preview): string {
  if (!p.ready) process.exitCode = 1;
  return fields([
    ["would", p.action],
    ["network", p.network],
    ["wallet", p.wallet],
    ...Object.entries(p.details),
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
      token: token.native ? "native" : token.address,
      "base units": raw.toString(),
      "wallet holds": `${formatUnits(held, token.decimals)} ${token.symbol}`,
      gas: sponsored
        ? "sponsored, if the facilitator accepts the request"
        : `paid by this wallet (${formatUnits(native, 18)} ${nativeSymbol})`,
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
      available: `${balance.available} ${balance.asset.symbol}`,
      locked: `${balance.locked} ${balance.asset.symbol}`,
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
          amount: `${pending.amount} ${pending.asset.symbol}`,
          requested: pending.requestedAt.toISOString(),
          "ready at": pending.readyAt.toISOString(),
        }
      : {},
    problems,
  );
}

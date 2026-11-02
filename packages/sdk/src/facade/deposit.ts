import {
  type AmountInput,
  formatUnits,
  parseAmount,
  toBaseUnits,
} from "@/amounts";
import { Asset, type DepositReceipt } from "@/client/model";
import {
  AmountZeroError,
  Erc20AllowanceRequiredError,
  GasRequiredError,
  InsufficientBalanceError,
} from "@/errors";
import type { DepositOptions, DepositResult } from "@/facade/models";
import { assetRef, type NetworkSession } from "@/facade/session";

const DEFAULT_TIMEOUT_MS = 60_000;
const FIRST_POLL_MS = 500;
const MAX_POLL_MS = 5_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function deposit(
  session: NetworkSession,
  input: AmountInput,
  options: DepositOptions = {},
): Promise<DepositResult> {
  const spec = parseAmount(input);
  const token = await session.token(spec.asset);
  const amount = toBaseUnits(spec.amount, token.decimals);
  if (amount === 0n) {
    throw new AmountZeroError("deposit amount must be positive");
  }

  const { client } = session;
  const gateway = await client.ctx.gateway();
  const asset = Asset.coerce(token.address);
  const show = (value: bigint) => formatUnits(value, token.decimals);

  // Before any signature prompt.
  const held = token.native
    ? await gateway.nativeBalance()
    : await gateway.erc20Balance(token.address);
  if (held < amount) {
    throw new InsufficientBalanceError({
      asset: token.symbol,
      needed: show(amount),
      available: show(held),
    });
  }

  const wait = options.wait ?? "spendable";
  const baseline =
    wait === "spendable" ? await coreTotal(session, token.address) : 0n;

  const selfFunded = async (): Promise<DepositReceipt> => {
    if ((await gateway.nativeBalance()) === 0n) {
      throw new GasRequiredError(
        `depositing ${token.symbol} as the wallet's own transaction needs ` +
          `${session.nativeSymbol} for gas, and the wallet holds none`,
      );
    }
    const builder = client.deposit.of(asset, amount).selfFunded();
    await builder.approve();
    return builder.send();
  };

  let receipt: DepositReceipt;
  if (token.native) {
    if (held === amount) {
      throw new GasRequiredError(
        `depositing all ${show(held)} ${token.symbol} leaves nothing for gas; ` +
          "a native deposit cannot be gasless",
      );
    }
    receipt = await client.deposit.of(asset, amount).selfFunded().send();
  } else if (options.gas === "self") {
    receipt = await selfFunded();
  } else {
    try {
      receipt = await client.deposit.of(asset, amount).send();
    } catch (err) {
      if (!(err instanceof Erc20AllowanceRequiredError)) throw err;
      receipt = await selfFunded();
    }
  }

  const result = (status: DepositResult["status"]): DepositResult => ({
    status,
    txHash: receipt.txHash,
    route: receipt.route,
    amount: show(amount),
    amountRaw: amount,
    asset: assetRef(token),
    network: session.caip2,
    explorerUrl: session.explorerTx(receipt.txHash),
    spendable: (opts = {}) => counted(opts.timeoutMs),
  });
  const counted = async (timeoutMs = DEFAULT_TIMEOUT_MS) =>
    result(
      (await untilCounted(session, token.address, baseline + amount, timeoutMs))
        ? "spendable"
        : "pending",
    );

  return wait === "mined" ? result("mined") : counted(options.timeoutMs);
}

async function coreTotal(
  session: NetworkSession,
  asset: string,
): Promise<bigint> {
  const balance = await session.client.rpc.getUserAssetBalance(
    session.client.signerAddress,
    asset,
  );
  return balance?.total ?? 0n;
}

/**
 * The money has moved by now, so poll errors are retried and running out of
 * time returns `false`. Comparing totals can race with other activity on the
 * wallet; that only moves when the wait ends.
 */
async function untilCounted(
  session: NetworkSession,
  asset: string,
  target: bigint,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let delay = FIRST_POLL_MS;
  for (;;) {
    try {
      if ((await coreTotal(session, asset)) >= target) return true;
    } catch {}
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await sleep(Math.min(delay, remaining));
    delay = Math.min(delay * 2, MAX_POLL_MS);
  }
}

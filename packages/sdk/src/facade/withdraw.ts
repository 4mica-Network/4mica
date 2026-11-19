import {
  type AmountInput,
  formatUnits,
  parseAmount,
  type ResolvedToken,
  toBaseUnits,
} from "@/amounts";
import { Asset, type WithdrawReceipt } from "@/client/model";
import {
  AmountZeroError,
  GracePeriodNotElapsedError,
  NoWithdrawalRequestedError,
} from "@/errors";
import type { PendingWithdrawal, WithdrawResult } from "@/facade/models";
import { assetRef, type NetworkSession } from "@/facade/session";

function result(
  session: NetworkSession,
  token: ResolvedToken,
  receipt: WithdrawReceipt,
): WithdrawResult {
  return {
    txHash: receipt.txHash,
    route: receipt.route,
    asset: assetRef(token),
    network: session.caip2,
    explorerUrl: session.explorerTx(receipt.txHash),
  };
}

export async function requestWithdrawal(
  session: NetworkSession,
  input: AmountInput,
): Promise<WithdrawResult> {
  const spec = parseAmount(input);
  const token = await session.token(spec.asset);
  const amount = toBaseUnits(spec.amount, token.decimals);
  if (amount === 0n) {
    throw new AmountZeroError("withdrawal amount must be positive");
  }
  const receipt = await session.client.withdraw
    .request(Asset.coerce(token.address), amount)
    .send();
  return result(session, token, receipt);
}

export async function cancelWithdrawal(
  session: NetworkSession,
  asset: string,
): Promise<WithdrawResult> {
  const token = await session.token(asset);
  const receipt = await session.client.withdraw
    .cancel(Asset.coerce(token.address))
    .send();
  return result(session, token, receipt);
}

/** Checked against the chain first, so an early call says when instead of reverting. */
export async function finalizeWithdrawal(
  session: NetworkSession,
  asset: string,
): Promise<WithdrawResult> {
  const token = await session.token(asset);
  const pending = (await pendingWithdrawals(session)).find(
    (w) => w.asset.address.toLowerCase() === token.address.toLowerCase(),
  );
  if (!pending) {
    throw new NoWithdrawalRequestedError(
      `no withdrawal of ${token.symbol} is pending; request one with withdraw()`,
    );
  }
  if (!pending.ready) {
    throw new GracePeriodNotElapsedError(
      `the withdrawal of ${pending.amount} ${token.symbol} can be finalized ` +
        `from ${pending.readyAt.toISOString()}`,
    );
  }
  const receipt = await session.client.withdraw
    .finalize(Asset.coerce(token.address))
    .send();
  return result(session, token, receipt);
}

export async function pendingWithdrawals(
  session: NetworkSession,
): Promise<PendingWithdrawal[]> {
  const gateway = await session.client.ctx.gateway();
  const [positions, grace] = await Promise.all([
    gateway.getUserAssets(),
    gateway.withdrawalGracePeriod(),
  ]);
  const pending: PendingWithdrawal[] = [];
  for (const position of positions) {
    if (position.withdrawalRequestAmount === 0n) continue;
    // A delisted asset is still reported, in base units.
    const listed = await session.tryToken(position.asset);
    const asset = listed
      ? assetRef(listed)
      : { symbol: position.asset, address: position.asset, decimals: 0 };
    const requestedSecs = Number(position.withdrawalRequestTimestamp);
    const readyAt = new Date((requestedSecs + Number(grace)) * 1000);
    pending.push({
      asset,
      amount: formatUnits(position.withdrawalRequestAmount, asset.decimals),
      amountRaw: position.withdrawalRequestAmount,
      requestedAt: new Date(requestedSecs * 1000),
      readyAt,
      ready: readyAt.getTime() <= Date.now(),
      network: session.caip2,
    });
  }
  return pending;
}

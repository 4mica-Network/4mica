import { formatUnits } from "@/amounts";
import { OutcomeUnknownError } from "@/errors";
import type { Position, SettleOptions, SettleResult } from "@/facade/models";
import { assetRef, type NetworkSession } from "@/facade/session";
import type { ClearingPosition } from "@/models";

async function toPosition(
  session: NetworkSession,
  position: ClearingPosition,
): Promise<Position> {
  // A delisted asset is still reported, in base units.
  const listed = await session.tryToken(position.assetAddress);
  const asset = listed
    ? assetRef(listed)
    : {
        symbol: position.assetAddress,
        address: position.assetAddress,
        decimals: 0,
      };
  const units = (raw: bigint) => formatUnits(raw, asset.decimals);
  return {
    cycle: position.cycleIdText,
    cycleId: position.cycleId,
    asset,
    role: position.role === "NET_DEBTOR" ? "debtor" : "creditor",
    amount: units(position.amount),
    grossOutgoing: units(position.grossOutgoing),
    grossIncoming: units(position.grossIncoming),
    raw: {
      amount: position.amount,
      grossOutgoing: position.grossOutgoing,
      grossIncoming: position.grossIncoming,
    },
    payBy: new Date(position.paymentSubmissionDeadline * 1000),
    finalAt: new Date(position.paymentFinalityDeadline * 1000),
    commitConfirmed: position.commitConfirmed,
    network: session.caip2,
  };
}

/** What the wallet still owes and is still owed, soonest deadline first. */
export async function openPositions(
  session: NetworkSession,
): Promise<Position[]> {
  const positions = await session.client.settlement.positions();
  return Promise.all(positions.map((p) => toPosition(session, p)));
}

/**
 * Pays every open debit and claims every open credit, one at a time and in
 * the order core lists them (soonest deadline first). One that fails does
 * not stop the rest: each position gets its own result.
 */
export async function settleAll(
  session: NetworkSession,
  options: SettleOptions,
): Promise<SettleResult[]> {
  const { settlement } = session.client;
  const results: SettleResult[] = [];
  for (const position of await openPositions(session)) {
    const action = position.role === "debtor" ? "pay" : "claim";
    if (options.only && options.only !== action) continue;
    if (!position.commitConfirmed) {
      // Core lists the position as soon as the cycle is netted; the
      // ClearingHouse only takes a payment once the commit is on-chain.
      results.push({
        position,
        action,
        status: "skipped",
        reason:
          "the cycle's commit is not confirmed on-chain yet; settle again shortly",
      });
      continue;
    }
    try {
      const receipt =
        action === "pay"
          ? await settlement.pay(position.cycle).send()
          : await settlement.claim(position.cycle).send();
      results.push({
        position,
        action,
        status: "settled",
        txHash: receipt.txHash,
        route: receipt.route,
        explorerUrl: session.explorerTx(receipt.txHash),
      });
    } catch (error) {
      results.push({
        position,
        action,
        // Sent, and nobody said what became of it: not something to run
        // again before looking.
        status: error instanceof OutcomeUnknownError ? "unknown" : "failed",
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }
  return results;
}

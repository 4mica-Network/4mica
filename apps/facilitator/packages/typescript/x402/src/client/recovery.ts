import {
  type PaymentClient,
  parseCheckpointRequiredDetails,
  parseTimestampNotPastCutoffDetails,
} from '@4mica/sdk'
import type { SettleResponse } from '@x402/core/types'

/** The calls a refused payment is recovered with. */
export type RecoveringPayer = Pick<
  PaymentClient,
  'activeCycle' | 'checkpointActiveCycle' | 'checkpointCycle'
>

const PREFIX = 'invalid_4mica_credit_'

/** Waiting longer than this for a checkpoint cutoff to pass is not worth it. */
const MAX_CUTOFF_WAIT_MS = 10_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Fixes what a refused settlement says is stale, so that a payment signed
 * afterwards can go through: checkpoints when core asks for one, relearns the
 * active cycle and core's clock when the payment carried old ones, and waits
 * out a checkpoint cutoff. `false` when signing again would not help.
 */
export async function recoverRefusedPayment(
  payer: RecoveringPayer,
  asset: string,
  refusal: Pick<SettleResponse, 'errorReason' | 'extra'>,
  wait: (ms: number) => Promise<void> = sleep
): Promise<boolean> {
  const details = refusal.extra?.details
  switch (refusal.errorReason) {
    case `${PREFIX}checkpoint_required`: {
      const cycleId = parseCheckpointRequiredDetails(details)?.cycleId
      if (cycleId) await payer.checkpointCycle(asset, cycleId)
      else await payer.checkpointActiveCycle(asset)
      return true
    }
    case `${PREFIX}cycle_mismatch`:
    case `${PREFIX}future_timestamp`:
    case `${PREFIX}stale_timestamp`:
      // Reading the cycle relearns core's clock, which also retires a cached
      // cycle whose period has ended.
      await payer.activeCycle(asset)
      return true
    case `${PREFIX}timestamp_not_past_cutoff`: {
      const cutoff = parseTimestampNotPastCutoffDetails(details)
      // One second more than strictly needed: the clock core reports is
      // truncated to the second.
      const waitMs = cutoff ? (cutoff.timestampCutoff + 2 - cutoff.serverTime) * 1000 : 2000
      if (waitMs > MAX_CUTOFF_WAIT_MS) return false
      if (waitMs > 0) await wait(waitMs)
      await payer.activeCycle(asset)
      return true
    }
    default:
      return false
  }
}

import type { PaymentRequirements } from '@4mica/x402'
import type { FourMicaSettleResponse } from '@4mica/x402/server'
import { formatUnits } from 'viem'

/** The token a run is priced in, for printing amounts. */
export interface TokenInfo {
  decimals: number
  symbol: string
}

/** What one run cost against its cap, in atomic units of the requirement's asset. */
export interface RunBilling {
  /** The guarantee the buyer signed: the most a run may cost. */
  cap: string
  /** What the run cost: results × the per-result price, never above the cap. */
  charged: string
  /** What the seller pays back: the cap minus what was charged. */
  refund: string
  results: number
  /** The price of one result. */
  pricePerResult: string
}

/**
 * Meters a run the way a pay-per-event Actor does: every result is one event at a fixed
 * price. The cap is a ceiling, so a run that produces more than the cap covers is charged
 * the cap and refunds nothing.
 */
export function meterRun(cap: string, pricePerResult: string, results: number): RunBilling {
  const capUnits = BigInt(cap)
  const cost = BigInt(pricePerResult) * BigInt(results)
  const charged = cost < capUnits ? cost : capUnits
  return {
    cap,
    charged: charged.toString(),
    refund: (capUnits - charged).toString(),
    results,
    pricePerResult,
  }
}

/**
 * The requirements the seller signs to pay the buyer back: the cap's entry with the roles
 * swapped. Same scheme, network, asset and EIP-712 domain, so the same facilitator settles
 * it and core nets the two guarantees against each other when the cycle commits.
 */
export function refundRequirements(
  cap: PaymentRequirements,
  buyer: string,
  refund: string
): PaymentRequirements {
  return { ...cap, payTo: buyer, amount: refund, extra: { ...cap.extra } }
}

/** The refund guarantee, once the facilitator has settled it. */
export interface RefundReceipt {
  /** Atomic units paid back. */
  amount: string
  /** The seller: payer of the refund guarantee. */
  from: string
  /** The buyer: its recipient. */
  to: string
  settlement: FourMicaSettleResponse
}

/** The receipt without the settlement's certificate, for a header or a tool result. */
export function refundSummary(receipt: RefundReceipt): {
  amount: string
  from: string
  to: string
} {
  return { amount: receipt.amount, from: receipt.from, to: receipt.to }
}

/** The billing a buyer's client gets back: the figures, and the refund if one was issued. */
export function billingSummary(
  billing: RunBilling,
  refund: RefundReceipt | undefined
): Record<string, unknown> {
  return { ...billing, refunded: refund ? refundSummary(refund) : null }
}

/** `units` in whole tokens with at least two decimals, so `0.9` prints as `0.90`. */
export function formatAmount(units: bigint | string, token: TokenInfo): string {
  const [whole, fraction = ''] = formatUnits(BigInt(units), token.decimals).split('.')
  const padded = fraction.length < 2 ? `${fraction}00`.slice(0, 2) : fraction
  return `${whole}.${padded} ${token.symbol}`
}

/** One line a person can read: what the run cost, and what went back. */
export function describeBilling(
  billing: RunBilling,
  refund: RefundReceipt | undefined,
  token: TokenInfo
): string {
  const fmt = (units: string) => formatAmount(units, token)
  const results = `${billing.results} result${billing.results === 1 ? '' : 's'}`
  const charged = `Charged ${fmt(billing.charged)} of the ${fmt(billing.cap)} cap: ${results} at ${fmt(billing.pricePerResult)}.`
  if (BigInt(billing.refund) === 0n)
    return `${charged} The run used the whole cap; nothing to refund.`
  if (!refund)
    return `${charged} The ${fmt(billing.refund)} refund could not be issued, so the cap stands.`
  return `${charged} Refunded ${fmt(billing.refund)} to ${refund.to} as a 4mica-credit guarantee; cap and refund net to ${fmt(billing.charged)} when the cycle commits.`
}

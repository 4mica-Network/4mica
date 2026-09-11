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

/**
 * The billing a buyer's client gets back: the figures, and the refund if one was issued,
 * with its settlement, whose certificate is core's signed word that the buyer holds a
 * guarantee for that amount.
 */
export function billingSummary(
  billing: RunBilling,
  refund: RefundReceipt | undefined
): Record<string, unknown> {
  return {
    ...billing,
    refunded: refund ? { ...refundSummary(refund), settlement: refund.settlement } : null,
  }
}

/** `units` in whole tokens with at least two decimals, so `0.9` prints as `0.90`. */
export function formatAmount(units: bigint | string, token: TokenInfo): string {
  const [whole, fraction = ''] = formatUnits(BigInt(units), token.decimals).split('.')
  const padded = fraction.length < 2 ? `${fraction}00`.slice(0, 2) : fraction
  return `${whole}.${padded} ${token.symbol}`
}

/** `0x5Ef6…6a88`: enough of an address to tell two apart on screen. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export interface RunParties {
  /** The buyer, when the payment named one. */
  buyer?: string
  seller: string
}

/**
 * The receipt a person reads at a glance: three lines, one per guarantee and one for the
 * metering between them. The same text goes in the tool result and the server log.
 */
export function receipt(
  billing: RunBilling,
  refund: RefundReceipt | undefined,
  token: TokenInfo,
  parties: RunParties
): string {
  const fmt = (units: string) => formatAmount(units, token).padEnd(12)
  const buyer = parties.buyer ? `buyer ${shortAddress(parties.buyer)}` : 'the buyer'
  const seller = shortAddress(parties.seller)
  const results = `${billing.results} result${billing.results === 1 ? '' : 's'}`
  const lines = [
    `Cap       ${fmt(billing.cap)} guarantee from ${buyer} to seller ${seller}`,
    `Charged   ${fmt(billing.charged)} ${results} at ${formatAmount(billing.pricePerResult, token)}`,
  ]
  if (BigInt(billing.refund) === 0n) {
    lines.push(`Refunded  ${fmt('0')} the run used the whole cap`)
  } else if (!refund) {
    lines.push(
      `Refunded  ${fmt('0')} the ${formatAmount(billing.refund, token)} refund could not be issued; the cap stands`
    )
  } else {
    lines.push(
      `Refunded  ${fmt(billing.refund)} guarantee from seller back to buyer; the two net to ${formatAmount(billing.charged, token)} when the cycle commits`
    )
  }
  return lines.join('\n')
}

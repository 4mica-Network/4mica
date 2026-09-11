import type { Network, PaymentPayload, PaymentRequired, PaymentRequirements } from '@4mica/x402'
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader } from '@x402/core/http'
import type { SettleResponse } from '@x402/core/types'
import { getAddress, isAddress } from 'viem'
import {
  billingSummary,
  describeBilling,
  type RefundReceipt,
  type RunBilling,
  refundSummary,
  type TokenInfo,
} from './billing.js'

/** MCP `_meta` key a payer puts the decoded payment payload under (x402 MCP transport). */
export const MCP_PAYMENT_META_KEY = 'x402/payment'
/** MCP `_meta` key the settlement response travels back under. */
export const MCP_PAYMENT_RESPONSE_META_KEY = 'x402/payment-response'
/** HTTP header the refund receipt travels back under, next to `payment-response`. */
export const REFUND_HEADER = 'payment-refund'

/** Apify's 402 body, verbatim, so a client written against their API parses ours. */
export const APIFY_PAYMENT_REQUIRED_BODY = {
  error: {
    type: 'x402-payment-required',
    message: 'x402 payment header missing. Add your PAYMENT-SIGNATURE or Apify token to proceed.',
  },
} as const

/** Apify's advertised windows: a run may take hours on `upto`; an `exact` transfer is a minute. */
export const UPTO_MAX_TIMEOUT_SECONDS = 18_000
export const EXACT_MAX_TIMEOUT_SECONDS = 60

/**
 * Circle USDC per network, the asset Apify's `upto` and `exact` entries name, with the
 * EIP-712 domain name each deployment uses. Only the shape-only entries use it: the
 * `4mica-credit` entry carries whichever USDC core lists for the network.
 */
const CIRCLE_USDC: Partial<Record<Network, { asset: string; name: string }>> = {
  'eip155:8453': { asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin' },
  'eip155:84532': { asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', name: 'USDC' },
}

export interface ShapeOnlyAcceptsInput {
  network: Network
  payTo: string
  /** Atomic units, the same figure the real entry advertises. */
  amount: string
}

/**
 * The `upto` and `exact` entries Apify's run endpoint advertises, reproduced for the
 * demo's network. They are shape-only: the 4mica facilitator does not verify them, and
 * a payer that picks one gets a settlement failure instead of a run. They exist so the
 * 402 differs from Apify's only in the third entry and the network.
 */
export function shapeOnlyAccepts({
  network,
  payTo,
  amount,
}: ShapeOnlyAcceptsInput): PaymentRequirements[] {
  const usdc = CIRCLE_USDC[network]
  if (!usdc) throw new Error(`No Circle USDC address known for ${network}`)
  const extra = { name: usdc.name, version: '2' }
  return [
    {
      scheme: 'upto',
      network,
      asset: usdc.asset,
      amount,
      payTo,
      maxTimeoutSeconds: UPTO_MAX_TIMEOUT_SECONDS,
      extra,
    },
    {
      scheme: 'exact',
      network,
      asset: usdc.asset,
      amount,
      payTo,
      maxTimeoutSeconds: EXACT_MAX_TIMEOUT_SECONDS,
      extra,
    },
  ]
}

export interface ResourceInfo {
  url: string
  description?: string
  mimeType?: string
}

/** The x402 v2 challenge for a resource: the accepts in the order the seller prefers them. */
export function paymentRequiredFor(
  resource: ResourceInfo,
  accepts: PaymentRequirements[]
): PaymentRequired {
  return { x402Version: 2, resource, accepts }
}

/** The `payment-required` header value: the challenge as base64 JSON. */
export function paymentRequiredHeader(paymentRequired: PaymentRequired): string {
  return encodePaymentRequiredHeader(paymentRequired)
}

export interface PaymentSources {
  /** The `PAYMENT-SIGNATURE` header, base64 JSON. */
  header?: string | string[]
  /** The `_meta` of an MCP `tools/call` request, which may carry the decoded payload. */
  meta?: Record<string, unknown>
}

/**
 * The payer's payment, from an MCP request's `_meta["x402/payment"]` first (the x402 MCP
 * transport) and the `PAYMENT-SIGNATURE` header second; mcpc sends both. `undefined` when
 * the request carries neither, which is the cue to answer with the challenge. Throws when
 * a header is present but is not a payment payload, which is a malformed request rather
 * than an unpaid one.
 */
export function readPaymentPayload({ header, meta }: PaymentSources): PaymentPayload | undefined {
  const fromMeta = meta?.[MCP_PAYMENT_META_KEY]
  if (isPaymentPayload(fromMeta)) return fromMeta

  const value = Array.isArray(header) ? header[0] : header
  if (!value) return undefined

  let decoded: unknown
  try {
    decoded = decodePaymentSignatureHeader(value)
  } catch {
    throw new Error('PAYMENT-SIGNATURE is not base64-encoded JSON')
  }
  if (!isPaymentPayload(decoded)) {
    throw new Error('PAYMENT-SIGNATURE is not an x402 payment payload')
  }
  return decoded
}

/**
 * The buyer: the `user_address` in the signed claims of a `4mica-credit` payment, which is
 * what the facilitator verified and core bound the guarantee to. Read from the payload
 * rather than the verify or settle response, since not every facilitator echoes it back.
 */
export function payerOf(payload: PaymentPayload): string | undefined {
  const claims = payload.payload?.claims
  if (!isRecord(claims)) return undefined
  const candidate = claims.user_address ?? claims.userAddress
  return typeof candidate === 'string' && isAddress(candidate) ? getAddress(candidate) : undefined
}

function isPaymentPayload(value: unknown): value is PaymentPayload {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.x402Version === 'number' &&
    isRecord(candidate.accepted) &&
    isRecord(candidate.payload)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The `_meta.x402` block Apify's MCP server puts on a paid tool: `accepts[]` with every
 * scheme, plus the first entry's fields flat for clients that read only those.
 */
export function toolPaymentMeta(accepts: PaymentRequirements[]): Record<string, unknown> {
  const [preferred] = accepts
  if (!preferred) throw new Error('a paid tool needs at least one accept entry')
  return { paymentRequired: true, accepts, ...preferred }
}

/** A `CallToolResult`, open-ended the way the MCP SDK types it. */
export interface ToolResult {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
  _meta?: Record<string, unknown>
}

/**
 * The x402 MCP challenge: an error result whose structured content is the challenge.
 * The text mirrors it for clients that read only `content`.
 */
export function paymentRequiredToolResult(paymentRequired: PaymentRequired): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(paymentRequired) }],
    structuredContent: { ...paymentRequired },
  }
}

/**
 * The cap's settlement with x402's `amount` set to what the run cost once the refund is
 * netted: the field `upto` uses for "settled below the authorized maximum".
 */
export function settledFor(settlement: SettleResponse, billing: RunBilling): SettleResponse {
  return { ...settlement, amount: billing.charged }
}

/** The `payment-refund` header value: the receipt as JSON, without the certificate. */
export function refundHeader(receipt: RefundReceipt): string {
  return JSON.stringify(refundSummary(receipt))
}

/**
 * A paid run's result: one line on what it cost and what came back, then the dataset.
 * The billing sits in `structuredContent` and the netted settlement in `_meta`.
 */
export function paidToolResult(
  items: unknown[],
  settlement: SettleResponse,
  billing: RunBilling,
  refund: RefundReceipt | undefined,
  token: TokenInfo
): ToolResult {
  return {
    content: [
      { type: 'text', text: describeBilling(billing, refund, token) },
      { type: 'text', text: JSON.stringify(items, null, 2) },
    ],
    structuredContent: { items, billing: billingSummary(billing, refund) },
    _meta: { [MCP_PAYMENT_RESPONSE_META_KEY]: settledFor(settlement, billing) },
  }
}

/** A failed run: an error result the client shows as-is, no challenge attached. */
export function errorToolResult(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

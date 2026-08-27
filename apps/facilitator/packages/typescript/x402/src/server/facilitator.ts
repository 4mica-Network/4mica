import { type FacilitatorConfig, HTTPFacilitatorClient } from '@x402/core/server'
import type { Network, PaymentPayload, PaymentRequirements, SettleResponse } from '@x402/core/types'

const DEFAULT_FACILITATOR_URL = 'https://x402.4mica.xyz'

export interface OpenTabRequest {
  userAddress: string
  recipientAddress: string
  network?: Network
  erc20Token?: string
  ttlSeconds?: number
}

export interface OpenTabResponse {
  tabId: string
  userAddress: string
  recipientAddress: string
  assetAddress: string
  startTimestamp: number
  ttlSeconds: number
  nextReqId: string
}

export interface CertificateResponse {
  claims: string
  signature: string
}

export type FourMicaSettleResponse = SettleResponse & {
  certificate?: CertificateResponse
  txHash?: string
  networkId?: string
  error?: string
}

export class OpenTabError extends Error {
  constructor(
    public readonly status: number,
    public readonly response: OpenTabResponse
  ) {
    super(`OpenTab failed with status ${status}`)
    this.name = 'OpenTabError'
  }
}

export class FourMicaFacilitatorClient extends HTTPFacilitatorClient {
  constructor(config?: FacilitatorConfig) {
    super({ ...config, url: config?.url ?? DEFAULT_FACILITATOR_URL })
  }

  async openTab(
    userAddress: string,
    paymentRequirements: PaymentRequirements,
    ttlSeconds?: number,
    guaranteeVersion?: number
  ): Promise<OpenTabResponse> {
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const authHeaders = await this.createAuthHeaders('tabs')
    headers = { ...headers, ...authHeaders.headers }

    const response = await fetch(`${this.url}/tabs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        this.safeJson({
          userAddress,
          recipientAddress: paymentRequirements.payTo,
          network: paymentRequirements.network,
          erc20Token: paymentRequirements.asset,
          ttlSeconds,
          guaranteeVersion: guaranteeVersion ?? 1,
        })
      ),
    })

    const data = await response.json()

    if (typeof data === 'object' && data !== null && 'tabId' in data) {
      const openTabResponse = data as OpenTabResponse
      if (!response.ok) {
        throw new OpenTabError(response.status, openTabResponse)
      }
      return openTabResponse
    }

    throw new Error(`Facilitator openTab failed (${response.status}): ${JSON.stringify(data)}`)
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<FourMicaSettleResponse> {
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const authHeaders = await this.createAuthHeaders('settle')
    headers = { ...headers, ...authHeaders.headers }

    const response = await fetch(`${this.url}/settle`, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        this.safeJson({
          x402Version: paymentPayload.x402Version,
          paymentPayload,
          paymentRequirements,
        })
      ),
    })

    const data = (await response.json()) as Record<string, unknown>
    const normalized = normalizeSettleResponse(data, paymentRequirements)

    if (!response.ok || !normalized.success) {
      throw new Error(
        `Facilitator settle failed (${response.status}): ${normalized.errorReason ?? normalized.error ?? 'unknown error'}`
      )
    }

    return normalized
  }

  /**
   * Helper to convert objects to JSON-safe format.
   * Handles BigInt and other non-JSON types.
   *
   * @param obj - The object to convert
   * @returns The JSON-safe representation of the object
   */
  private safeJson<T>(obj: T): T {
    return JSON.parse(
      JSON.stringify(obj, (_, value) => (typeof value === 'bigint' ? value.toString() : value))
    )
  }
}

function normalizeSettleResponse(
  payload: Record<string, unknown>,
  requirements: PaymentRequirements
): FourMicaSettleResponse {
  const transaction = String(
    payload.transaction ??
      payload.transactionHash ??
      payload.txHash ??
      payload.tx_hash ??
      payload.hash ??
      ''
  )
  const network = String(
    payload.network ?? payload.networkId ?? payload.network_id ?? requirements.network
  ) as Network
  const errorReason =
    typeof payload.errorReason === 'string'
      ? payload.errorReason
      : typeof payload.error_reason === 'string'
        ? payload.error_reason
        : typeof payload.error === 'string'
          ? payload.error
          : typeof payload.message === 'string'
            ? payload.message
            : undefined

  const certificate =
    payload.certificate &&
    typeof payload.certificate === 'object' &&
    typeof (payload.certificate as Record<string, unknown>).claims === 'string' &&
    typeof (payload.certificate as Record<string, unknown>).signature === 'string'
      ? {
          claims: (payload.certificate as Record<string, string>).claims,
          signature: (payload.certificate as Record<string, string>).signature,
        }
      : undefined

  return {
    success: Boolean(payload.success ?? errorReason === undefined),
    errorReason,
    payer:
      typeof payload.payer === 'string'
        ? payload.payer
        : typeof payload.userAddress === 'string'
          ? payload.userAddress
          : typeof payload.user_address === 'string'
            ? payload.user_address
            : undefined,
    transaction,
    network,
    certificate,
    txHash:
      typeof payload.txHash === 'string'
        ? payload.txHash
        : typeof payload.tx_hash === 'string'
          ? payload.tx_hash
          : transaction || undefined,
    networkId:
      typeof payload.networkId === 'string'
        ? payload.networkId
        : typeof payload.network_id === 'string'
          ? payload.network_id
          : network,
    error: typeof payload.error === 'string' ? payload.error : undefined,
  }
}

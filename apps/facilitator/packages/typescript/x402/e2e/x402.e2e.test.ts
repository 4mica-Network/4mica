import { GuaranteeReceipt } from '@4mica/sdk'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  awaitNextCycle,
  connectBuyer,
  readStack,
  type Seller,
  settlementOf,
  startSeller,
} from './stack.js'

const stack = readStack()

describe('@4mica/x402 against the local stack', () => {
  let seller: Seller

  beforeAll(async () => {
    seller = await startSeller(stack)
  })

  afterAll(async () => {
    await seller?.close()
  })

  it('pays for a request and hands back a receipt that verifies', async () => {
    const buyer = await connectBuyer(stack, stack.payerKey)

    const response = await buyer.fetch(seller.url)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ paid: true })
    const settlement = settlementOf(response)
    expect(settlement?.success).toBe(true)

    const guarantee = await buyer.client.payment.verifyGuarantee(
      GuaranteeReceipt.fromRpc(settlement?.extra?.receipt)
    )
    expect(guarantee.client.toLowerCase()).toBe(buyer.client.signerAddress.toLowerCase())
    expect(guarantee.recipient.toLowerCase()).toBe(stack.payTo.toLowerCase())
    expect(guarantee.amount).toBe(1n)
  })

  it("hands the facilitator's refusal to the payer in PAYMENT-RESPONSE", async () => {
    // Signs a valid payment, but has never deposited anything.
    const key = generatePrivateKey()
    const stranger = await connectBuyer(stack, key)

    const response = await stranger.fetch(seller.url)

    expect(response.status).toBe(402)
    const settlement = settlementOf(response)
    expect(settlement).toMatchObject({
      success: false,
      errorReason: 'invalid_4mica_credit_payer_not_registered',
      errorMessage: expect.any(String),
      extra: { retryable: false },
    })
    const details = settlement?.extra?.details as { user?: string } | undefined
    expect(details?.user?.toLowerCase()).toBe(privateKeyToAccount(key).address.toLowerCase())
  })

  it('checkpoints when core asks for one, then pays on the retry', async () => {
    const buyer = await connectBuyer(stack, stack.payerKey)
    const limit = stack.maxUncheckpointed
    expect((await buyer.client.payment.activeCycle(stack.asset)).maxUncheckpointed).toBe(limit)
    // Core counts uncheckpointed payments per cycle, so start on one this payer has not paid in.
    await awaitNextCycle(buyer.client, stack.asset)

    for (let i = 0; i < limit; i++) {
      expect((await buyer.fetch(seller.url)).status).toBe(200)
    }
    const before = await buyer.client.payment.checkpointBatch(stack.asset)
    expect(before.authorizations).toHaveLength(limit)

    // One past the limit: core refuses it until the payer checkpoints.
    const response = await buyer.fetch(seller.url)

    expect(response.status).toBe(200)
    expect(settlementOf(response)?.success).toBe(true)
    const after = await buyer.client.payment.checkpointBatch(stack.asset)
    expect(after.cycleId).toBe(before.cycleId)
    expect(after.previous).toBeDefined()
    expect(after.authorizations).toHaveLength(1)
  })
})

import { describe, expect, it, vi } from 'vitest'

import { recoverRefusedPayment } from '../src/client/recovery.js'

const USDC = '0x2222222222222222222222222222222222222222'
const CYCLE = `0x${'33'.repeat(32)}`

function payer() {
  return {
    activeCycle: vi.fn().mockResolvedValue({}),
    checkpointActiveCycle: vi.fn().mockResolvedValue(undefined),
    checkpointCycle: vi.fn().mockResolvedValue(undefined),
  }
}

function refusal(reason: string, details?: Record<string, unknown>) {
  return { errorReason: reason, extra: details ? { retryable: false, details } : undefined }
}

describe('recoverRefusedPayment', () => {
  it('checkpoints the cycle core names', async () => {
    const p = payer()
    const recovered = await recoverRefusedPayment(
      p as never,
      USDC,
      refusal('invalid_4mica_credit_checkpoint_required', {
        cycle_id: CYCLE,
        cycle_id_text: '7',
        asset_address: USDC,
        payer: '0x9999999999999999999999999999999999999999',
        uncheckpointed: 64,
        max_uncheckpointed: 64,
      })
    )

    expect(recovered).toBe(true)
    expect(p.checkpointCycle).toHaveBeenCalledWith(USDC, CYCLE)
    expect(p.checkpointActiveCycle).not.toHaveBeenCalled()
  })

  it('checkpoints the active cycle when the refusal carries no details', async () => {
    const p = payer()
    expect(
      await recoverRefusedPayment(
        p as never,
        USDC,
        refusal('invalid_4mica_credit_checkpoint_required')
      )
    ).toBe(true)
    expect(p.checkpointActiveCycle).toHaveBeenCalledWith(USDC)
  })

  it.each([
    'invalid_4mica_credit_cycle_mismatch',
    'invalid_4mica_credit_future_timestamp',
    'invalid_4mica_credit_stale_timestamp',
  ])('relearns the cycle and clock on %s', async (reason) => {
    const p = payer()
    expect(await recoverRefusedPayment(p as never, USDC, refusal(reason))).toBe(true)
    expect(p.activeCycle).toHaveBeenCalledWith(USDC)
  })

  it('waits out a checkpoint cutoff before signing again', async () => {
    const p = payer()
    const wait = vi.fn().mockResolvedValue(undefined)
    const recovered = await recoverRefusedPayment(
      p as never,
      USDC,
      refusal('invalid_4mica_credit_timestamp_not_past_cutoff', {
        cycle_id: CYCLE,
        cycle_id_text: '7',
        asset_address: USDC,
        payer: '0x9999999999999999999999999999999999999999',
        timestamp: 1_700_000_000,
        timestamp_cutoff: 1_700_000_000,
        cumulative_gross: '10',
        server_time: 1_700_000_000,
      }),
      wait
    )

    expect(recovered).toBe(true)
    expect(wait).toHaveBeenCalledWith(2000)
    expect(p.activeCycle).toHaveBeenCalledWith(USDC)
  })

  it('gives up on a cutoff too far ahead', async () => {
    const p = payer()
    const wait = vi.fn()
    const recovered = await recoverRefusedPayment(
      p as never,
      USDC,
      refusal('invalid_4mica_credit_timestamp_not_past_cutoff', {
        cycle_id: CYCLE,
        cycle_id_text: '7',
        asset_address: USDC,
        payer: '0x9999999999999999999999999999999999999999',
        timestamp: 1_700_000_000,
        timestamp_cutoff: 1_700_000_060,
        cumulative_gross: '10',
        server_time: 1_700_000_000,
      }),
      wait
    )

    expect(recovered).toBe(false)
    expect(wait).not.toHaveBeenCalled()
  })

  it.each([
    'insufficient_funds',
    'invalid_4mica_credit_amount_mismatch',
    'invalid_4mica_credit_payer_suspended',
    'unexpected_settle_error',
  ])('leaves %s alone', async (reason) => {
    const p = payer()
    expect(await recoverRefusedPayment(p as never, USDC, refusal(reason))).toBe(false)
    expect(p.activeCycle).not.toHaveBeenCalled()
    expect(p.checkpointCycle).not.toHaveBeenCalled()
    expect(p.checkpointActiveCycle).not.toHaveBeenCalled()
  })
})

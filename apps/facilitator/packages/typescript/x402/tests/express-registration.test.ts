import { x402ResourceServer } from '@x402/core/server'
import { describe, expect, it } from 'vitest'

import { paymentMiddleware } from '../src/server/express/index.js'
import { FourMicaFacilitatorClient } from '../src/server/facilitator.js'
import { FourMicaEvmScheme, SUPPORTED_NETWORKS } from '../src/server/scheme.js'

describe('paymentMiddleware scheme registration', () => {
  it('keeps a scheme server the caller registered and fills in the other networks', () => {
    const custom = new FourMicaEvmScheme({
      coreUrls: { 'eip155:84532': 'http://localhost:3000/' },
    })
    const resourceServer = new x402ResourceServer(new FourMicaFacilitatorClient()).register(
      'eip155:84532',
      custom
    )

    paymentMiddleware({}, resourceServer, undefined, undefined, false)

    expect(resourceServer.getRegisteredScheme('eip155:84532', '4mica-credit')).toBe(custom)
    for (const network of SUPPORTED_NETWORKS) {
      expect(resourceServer.getRegisteredScheme(network, '4mica-credit')).toBeInstanceOf(
        FourMicaEvmScheme
      )
    }
  })
})

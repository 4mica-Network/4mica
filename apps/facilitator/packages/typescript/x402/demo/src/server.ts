import 'dotenv/config'
import { FourMicaEvmScheme, FourMicaFacilitatorClient } from '@4mica/x402/server'
import { paymentMiddlewareFromConfig } from '@4mica/x402/server/express'
import express from 'express'

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000
const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS
// Base Sepolia by default: the facilitator serves 4mica-credit there for x402 v1 and v2.
const NETWORK = (process.env.NETWORK || 'eip155:84532') as `${string}:${string}`
// Set CORE_URL to price against, and point payers at, a self-hosted core for NETWORK.
const CORE_URL = process.env.CORE_URL
// Facilitator that verifies and settles payments; the hosted one when unset.
const FACILITATOR_URL = process.env.FACILITATOR_URL
const PRICE = '$0.01'

if (!PAY_TO_ADDRESS) {
  console.error('Error: PAY_TO_ADDRESS environment variable is required')
  process.exit(1)
}

app.use(
  paymentMiddlewareFromConfig(
    {
      'GET /api/premium-data': {
        accepts: {
          scheme: '4mica-credit',
          // Resolved to the stablecoin core lists for NETWORK.
          price: PRICE,
          network: NETWORK,
          payTo: PAY_TO_ADDRESS,
          // Tells payers where NETWORK's core lives when it is not the hosted one.
          ...(CORE_URL ? { extra: { rpcUrl: CORE_URL } } : {}),
        },
        description: 'Access to premium data endpoint',
      },
    },
    FACILITATOR_URL ? new FourMicaFacilitatorClient({ url: FACILITATOR_URL }) : undefined,
    CORE_URL
      ? [
          {
            network: NETWORK,
            server: new FourMicaEvmScheme({ coreUrls: { [NETWORK]: CORE_URL } }),
          },
        ]
      : undefined
  )
)

app.get('/api/premium-data', (req, res) => {
  res.json({
    message: "Success! You've accessed the premium data.",
    data: {
      timestamp: new Date().toISOString(),
      secret: 'This is protected content behind a paywall',
      value: Math.random() * 1000,
    },
  })
})

app.get('/', (req, res) => {
  res.json({
    message: 'x402 Demo Server',
    network: NETWORK,
    core: CORE_URL ?? 'hosted',
    facilitator: FACILITATOR_URL ?? 'https://x402.4mica.xyz',
    endpoints: {
      free: ['/', '/health'],
      protected: [
        {
          path: '/api/premium-data',
          price: PRICE,
          description: 'Premium data endpoint (requires payment)',
        },
      ],
    },
  })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`x402 Demo Server running on http://localhost:${PORT}`)
  console.log(`Protected endpoint: http://localhost:${PORT}/api/premium-data`)
  console.log(`Payment required: ${PRICE} (4mica credit on ${NETWORK})`)
})

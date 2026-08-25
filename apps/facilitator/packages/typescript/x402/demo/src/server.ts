import 'dotenv/config'
import { paymentMiddlewareFromConfig } from '@4mica/x402/server/express'
import express from 'express'

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000
const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS
// This endpoint is hosted by this resource server. Clients call it after receiving
// a 402 response, and the middleware below forwards the tab-open request to the
// 4Mica facilitator on the server's behalf.
const ADVERTISED_ENDPOINT =
  process.env.ADVERTISED_ENDPOINT || `http://localhost:${PORT}/payment/tab`

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
          price: '$0.01',
          network: 'eip155:11155111', // Ethereum Sepolia
          payTo: PAY_TO_ADDRESS,
        },
        description: 'Access to premium data endpoint',
      },
    },
    {
      // The middleware injects this URL into paymentRequirements.extra.tabEndpoint
      // and also serves the POST route on this Express app.
      advertisedEndpoint: ADVERTISED_ENDPOINT,
      ttlSeconds: 3600, // 1 hour
    }
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
    endpoints: {
      free: ['/', '/health'],
      protected: [
        {
          path: '/api/premium-data',
          price: '$0.01',
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
  console.log(`Payment required: $0.01 (4mica credit on Sepolia)`)
  console.log(`Tab endpoint hosted by this server: POST ${ADVERTISED_ENDPOINT}`)
  console.log('Who calls it: payer clients after a 402 Payment Required response')
  console.log('What it does: opens or reuses a tab via the 4Mica facilitator and returns tab JSON')
})

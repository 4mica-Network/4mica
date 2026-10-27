import 'dotenv/config'
import { FourMicaEvmScheme } from '@4mica/x402/client'
import { decodePaymentResponseHeader } from '@x402/core/http'
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch'
import { privateKeyToAccount } from 'viem/accounts'

// Must match the server's NETWORK; Base Sepolia by default.
const NETWORK = (process.env.NETWORK || 'eip155:84532') as `${string}:${string}`
// Set CORE_URL to pay on a self-hosted core for NETWORK instead of the hosted deployment.
const CORE_URL = process.env.CORE_URL

async function main() {
  const privateKey = process.env.PRIVATE_KEY
  if (!privateKey || !privateKey.startsWith('0x')) {
    console.error('Error: PRIVATE_KEY environment variable must be set and start with 0x')
    console.error('Example: PRIVATE_KEY=0x1234... pnpm client')
    process.exit(1)
  }

  const apiUrl = process.env.API_URL || 'http://localhost:3000'
  const endpoint = `${apiUrl}/api/premium-data`

  console.log('Initializing x402 client...')
  console.log(`Target endpoint: ${endpoint}`)
  console.log(`Network: ${NETWORK}${CORE_URL ? ` (core at ${CORE_URL})` : ''}`)

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  console.log(`Using account: ${account.address}`)

  const scheme = await FourMicaEvmScheme.create(
    account,
    CORE_URL ? { coreUrls: { [NETWORK]: CORE_URL }, networks: [NETWORK] } : {}
  )

  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: NETWORK,
        client: scheme,
      },
    ],
  })

  console.log('\nMaking request to protected endpoint...')

  try {
    const response = await fetchWithPayment(endpoint)

    // A refused settlement comes back as a 402 whose PAYMENT-RESPONSE header
    // carries the facilitator's reason, not as a thrown error.
    if (!response.ok) {
      const header = response.headers.get('PAYMENT-RESPONSE')
      const settlement = header ? decodePaymentResponseHeader(header) : undefined
      const reason = settlement
        ? `${settlement.errorReason}: ${settlement.errorMessage}`
        : await response.text()
      console.error(`Request failed with ${response.status}:`, reason)
      process.exit(1)
    }

    const data = await response.json()

    console.log('Request successful!')
    console.log('Response:', JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('Request failed:', error)
    if (error instanceof Error) {
      console.error('Message:', error.message)
    }
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})

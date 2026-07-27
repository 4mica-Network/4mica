import 'dotenv/config'
import { FourMicaEvmScheme } from '@4mica/x402/client'
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch'
import { privateKeyToAccount } from 'viem/accounts'

async function main() {
  const privateKey = process.env.PRIVATE_KEY
  if (!privateKey || !privateKey.startsWith('0x')) {
    console.error('Error: PRIVATE_KEY environment variable must be set and start with 0x')
    console.error('Example: PRIVATE_KEY=0x1234... yarn client')
    process.exit(1)
  }

  const apiUrl = process.env.API_URL || 'http://localhost:3000'
  const endpoint = `${apiUrl}/api/premium-data`

  console.log('Initializing x402 client...')
  console.log(`Target endpoint: ${endpoint}`)

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  console.log(`Using account: ${account.address}`)

  const scheme = await FourMicaEvmScheme.create(account)

  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: 'eip155:11155111', // Ethereum Sepolia
        client: scheme,
      },
    ],
  })

  console.log('\nMaking request to protected endpoint...')

  try {
    const response = await fetchWithPayment(endpoint)
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

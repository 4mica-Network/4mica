import 'dotenv/config'
import { Client, ConfigBuilder } from '@4mica/sdk'
import { formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * Prints the payer's collateral as core sees it: total, locked behind open guarantees,
 * and free. Run it before and after a paid tool call to watch the lock move by the
 * price of one run and nothing else; no transaction happens until the cycle settles.
 */
const NETWORK = process.env.NETWORK || 'eip155:84532'
const CORE_URL = process.env.CORE_URL
const SYMBOL = 'USDC'

async function main() {
  const privateKey = process.env.PRIVATE_KEY
  if (!privateKey?.startsWith('0x')) {
    console.error('Error: PRIVATE_KEY environment variable must be set and start with 0x')
    console.error('Example: PRIVATE_KEY=0x1234... pnpm run balance')
    process.exit(1)
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const builder = new ConfigBuilder().signer(account)
  if (CORE_URL) {
    builder.rpcUrl(CORE_URL)
  } else {
    builder.network(NETWORK)
  }
  const client = await Client.connect(builder.build())

  try {
    const { tokens } = await client.rpc.getSupportedTokens()
    const token = tokens.find((entry) => entry.symbol.toUpperCase() === SYMBOL)
    if (!token || token.decimals === undefined) {
      const listed = tokens.map((entry) => entry.symbol).join(', ') || 'none'
      throw new Error(`core on ${NETWORK} lists no ${SYMBOL} (listed: ${listed})`)
    }

    const balance = await client.rpc.getUserAssetBalance(account.address, token.address)
    const total = balance?.total ?? 0n
    const locked = balance?.locked ?? 0n
    const fmt = (value: bigint) => `${formatUnits(value, token.decimals ?? 6)} ${SYMBOL}`

    console.log(`Account:    ${account.address}`)
    console.log(`Collateral: ${fmt(total)}`)
    console.log(`Locked:     ${fmt(locked)}  (behind open guarantees this cycle)`)
    console.log(`Free:       ${fmt(total - locked)}`)
  } finally {
    await client.aclose()
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})

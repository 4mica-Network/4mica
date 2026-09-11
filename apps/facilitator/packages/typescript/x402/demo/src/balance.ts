import 'dotenv/config'
import { Client, ConfigBuilder } from '@4mica/sdk'
import { privateKeyToAccount } from 'viem/accounts'
import { formatAmount } from './apify/billing.js'

/**
 * Prints a wallet's position as core sees it: collateral, what is locked behind the
 * guarantees it signed, what is free, what other wallets have signed to it, and the net
 * of the two, which is what the cycle settles. `WALLET=seller` reads `SELLER_PRIVATE_KEY`
 * instead of `PRIVATE_KEY`. Run it before and after a paid run: the buyer's lock rises by
 * the cap and its incoming by the refund; the seller's is the mirror image.
 */
const NETWORK = process.env.NETWORK || 'eip155:84532'
const CORE_URL = process.env.CORE_URL
const SYMBOL = 'USDC'
const WALLET = process.env.WALLET === 'seller' ? 'seller' : 'buyer'
const KEY_VAR = WALLET === 'seller' ? 'SELLER_PRIVATE_KEY' : 'PRIVATE_KEY'

async function main() {
  const privateKey = process.env[KEY_VAR]
  if (!privateKey?.startsWith('0x')) {
    console.error(`Error: ${KEY_VAR} environment variable must be set and start with 0x`)
    console.error(`Example: ${KEY_VAR}=0x1234... pnpm run balance`)
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
    const units = { decimals: token.decimals, symbol: SYMBOL }

    const balance = await client.rpc.getUserAssetBalance(account.address, token.address)
    const total = balance?.total ?? 0n
    const locked = balance?.locked ?? 0n

    // Guarantees other wallets signed to this one. Core lists them without an asset; the
    // demo only ever deals in USDC, so they are summed as such.
    const payments = await client.rpc.listRecipientPayments(account.address)
    const incoming = payments.filter((payment) => !payment.failed)
    const received = incoming.reduce((sum, payment) => sum + payment.amount, 0n)
    const net = locked - received
    const direction = net > 0n ? 'pays' : net < 0n ? 'receives' : 'moves nothing'
    const sign = net < 0n ? '-' : net > 0n ? '+' : ''
    const magnitude = net < 0n ? -net : net

    console.log(`Wallet:     ${WALLET} ${account.address}`)
    console.log(`Collateral: ${formatAmount(total, units)}`)
    console.log(
      `Locked:     ${formatAmount(locked, units)}  (behind the guarantees this wallet signed)`
    )
    console.log(`Free:       ${formatAmount(total - locked, units)}`)
    console.log(
      `Incoming:   ${formatAmount(received, units)}  (${incoming.length} guarantee${incoming.length === 1 ? '' : 's'} signed to this wallet)`
    )
    console.log(
      `Net:        ${sign}${formatAmount(magnitude, units)}  (${direction} when the cycle commits, if all of the above sits in the open cycle)`
    )
  } finally {
    await client.aclose()
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})

import 'dotenv/config'
import { Client, ConfigBuilder } from '@4mica/sdk'
import { formatUnits, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// Base Sepolia by default; any shorthand or CAIP-2 id ConfigBuilder.network() knows works.
const NETWORK = process.env.NETWORK || 'eip155:84532'
// The hosted facilitator sponsors the deposit's gas: one signature, no ETH needed.
// Set FACILITATOR_URL to an empty string to deposit self-funded from a wallet that holds gas.
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'https://x402.4mica.xyz'
// In whole tokens (e.g. "2" = 2 USDC); converted with the decimals core reports.
const DEPOSIT_AMOUNT = process.env.DEPOSIT_AMOUNT || '2'
const SYMBOL = 'USDC'

async function main() {
  const privateKey = process.env.PRIVATE_KEY
  if (!privateKey || !privateKey.startsWith('0x')) {
    console.error('Error: PRIVATE_KEY environment variable must be set and start with 0x')
    console.error('Example: PRIVATE_KEY=0x1234... pnpm deposit')
    process.exit(1)
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const builder = new ConfigBuilder().network(NETWORK).signer(account)
  if (FACILITATOR_URL) {
    builder.facilitatorUrl(FACILITATOR_URL)
  }
  const client = await Client.connect(builder.build())

  try {
    // Ask core which token it accepts rather than hardcoding an address.
    const { tokens } = await client.rpc.getSupportedTokens()
    const token = tokens.find((entry) => entry.symbol.toUpperCase() === SYMBOL)
    if (!token || token.decimals === undefined) {
      const listed = tokens.map((entry) => entry.symbol).join(', ') || 'none'
      throw new Error(`core on ${NETWORK} lists no ${SYMBOL} (listed: ${listed})`)
    }
    const amount = parseUnits(DEPOSIT_AMOUNT, token.decimals)

    console.log(`Account: ${account.address}`)
    console.log(`${SYMBOL} on ${NETWORK}: ${token.address}`)

    const before = await collateralOf(client, token.address)
    console.log(`Collateral before: ${formatUnits(before, token.decimals)} ${SYMBOL}`)

    const route = client.deposit.isGaslessAvailable()
      ? 'gasless, sponsored by the facilitator'
      : 'self-funded'
    console.log(`Depositing ${DEPOSIT_AMOUNT} ${SYMBOL} (${route})...`)
    const receipt = await client.deposit.of(token.address, amount).send()
    console.log(`Deposit tx: ${receipt.txHash} (route: ${receipt.route})`)

    const after = await collateralOf(client, token.address)
    console.log(`Collateral after:  ${formatUnits(after, token.decimals)} ${SYMBOL}`)
  } finally {
    await client.aclose()
  }
}

async function collateralOf(client: Client, asset: string): Promise<bigint> {
  const positions = await client.account.assets()
  const position = positions.find((entry) => entry.asset.toLowerCase() === asset.toLowerCase())
  return position?.collateral ?? 0n
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})

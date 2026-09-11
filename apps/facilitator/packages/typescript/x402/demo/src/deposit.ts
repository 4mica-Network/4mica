import 'dotenv/config'
import {
  Client,
  ConfigBuilder,
  type DepositReceipt,
  Erc20AllowanceRequiredError,
  FacilitatorNotConfiguredError,
} from '@4mica/sdk'
import { formatUnits, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// Base Sepolia by default; any shorthand or CAIP-2 id ConfigBuilder.network() knows works.
const NETWORK = process.env.NETWORK || 'eip155:84532'
// Set CORE_URL to deposit on a self-hosted core for NETWORK instead of the hosted deployment.
const CORE_URL = process.env.CORE_URL
// The facilitator sponsors the deposit's gas: one signature, no ETH needed. Set
// FACILITATOR_URL to an empty string to deposit self-funded from a wallet that holds gas.
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'https://x402.4mica.xyz'
// In whole tokens (e.g. "2" = 2 USDC); converted with the decimals core reports.
const DEPOSIT_AMOUNT = process.env.DEPOSIT_AMOUNT || '2'
const SYMBOL = 'USDC'
// WALLET=seller funds the seller wallet of the Apify-shaped demo, which pays the refunds.
const WALLET = process.env.WALLET === 'seller' ? 'seller' : 'buyer'
const KEY_VAR = WALLET === 'seller' ? 'SELLER_PRIVATE_KEY' : 'PRIVATE_KEY'

async function main() {
  const privateKey = process.env[KEY_VAR]
  if (!privateKey || !privateKey.startsWith('0x')) {
    console.error(`Error: ${KEY_VAR} environment variable must be set and start with 0x`)
    console.error(`Example: ${KEY_VAR}=0x1234... pnpm run deposit`)
    process.exit(1)
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const builder = new ConfigBuilder().signer(account)
  if (CORE_URL) {
    builder.rpcUrl(CORE_URL)
  } else {
    builder.network(NETWORK)
  }
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

    console.log(`Account: ${WALLET} ${account.address}`)
    console.log(`${SYMBOL} on ${NETWORK}: ${token.address}`)

    const before = await collateralOf(client, token.address)
    console.log(`Collateral before: ${formatUnits(before, token.decimals)} ${SYMBOL}`)

    const route = client.deposit.isGaslessAvailable()
      ? 'gasless, sponsored by the facilitator'
      : 'self-funded'
    console.log(`Depositing ${DEPOSIT_AMOUNT} ${SYMBOL} (${route})...`)
    const receipt = await deposit(client, token.address, amount)
    console.log(`Deposit tx: ${receipt.txHash} (route: ${receipt.route})`)

    // The balance is read from the chain through core's advertised RPC, which can trail the
    // facilitator's node by a few blocks right after the deposit; wait for it to catch up.
    const after = await collateralAbove(client, token.address, before)
    console.log(`Collateral after:  ${formatUnits(after, token.decimals)} ${SYMBOL}`)
  } finally {
    await client.aclose()
  }
}

async function deposit(client: Client, asset: string, amount: bigint): Promise<DepositReceipt> {
  const builder = client.deposit.of(asset, amount)
  try {
    return await builder.send()
  } catch (error) {
    // The SDK reports a facilitator without a relayer as "not configured".
    if (error instanceof FacilitatorNotConfiguredError) {
      console.log('Facilitator cannot sponsor the deposit; depositing self-funded instead...')
    } else if (!(error instanceof Erc20AllowanceRequiredError)) {
      throw error
    }
  }

  const selfFunded = builder.selfFunded()
  try {
    return await selfFunded.send()
  } catch (error) {
    if (!(error instanceof Erc20AllowanceRequiredError)) {
      throw error
    }
    console.log(`Approving the 4mica contract to pull ${DEPOSIT_AMOUNT} ${SYMBOL}...`)
    await selfFunded.approve()
    return selfFunded.send()
  }
}

async function collateralAbove(client: Client, asset: string, previous: bigint): Promise<bigint> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const current = await collateralOf(client, asset)
    if (current > previous) return current
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  console.warn(
    'Collateral has not changed after 30s; the read RPC may be lagging. Re-run to check.'
  )
  return collateralOf(client, asset)
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

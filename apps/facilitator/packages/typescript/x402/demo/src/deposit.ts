import 'dotenv/config'
import { Client, ConfigBuilder } from '@4mica/sdk'
import { privateKeyToAccount } from 'viem/accounts'

async function main() {
  const privateKey = process.env.PRIVATE_KEY
  if (!privateKey || !privateKey.startsWith('0x')) {
    console.error('Error: PRIVATE_KEY environment variable must be set and start with 0x')
    console.error('Example: PRIVATE_KEY=0x1234... yarn deposit')
    process.exit(1)
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const cfg = new ConfigBuilder()
    .rpcUrl('https://ethereum.sepolia.api.4mica.xyz')
    .signer(account)
    .build()
  const client = await Client.connect(cfg)

  // const amount = 2_000_000n // 2 USDC in base units

  // Gasless when a facilitator is configured, self-funded otherwise:
  // const depositReceipt = await client.deposit.of(USDC_ADDRESS, amount).send()
  // console.log('Deposit receipt:', depositReceipt)

  const positions = await client.account.assets()
  positions.forEach((position) => {
    console.log('User asset:', position.asset, ', collateral:', Number(position.collateral))
  })
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})

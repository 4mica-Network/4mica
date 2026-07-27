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
  const client = await Client.new(cfg)

  // const amount = 2_000_000 // 2 USDC in base units

  // const allowance = await client.user.approveErc20(USDC_ADDRESS, amount)
  // console.log('Approval receipt:', allowance)

  // const depositReceipt = await client.user.deposit(amount, USDC_ADDRESS)
  // console.log('Deposit receipt:', depositReceipt)

  const userInfo = await client.user.getUser()
  userInfo.forEach((user) => {
    console.log('User asset:', user.asset, ', collateral:', Number(user.collateral))
  })
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})

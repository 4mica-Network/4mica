"""Env: FOURMICA_WALLET_PRIVATE_KEY, optional FOURMICA_NETWORK, DEPOSIT
and PAID_URL (a 4mica-credit paywalled URL)."""

import asyncio
import os

from fourmica_sdk import FourMica, SpendLimits


async def main() -> None:
    spend = SpendLimits(per_payment="0.10 USDC", total="1 USDC")
    async with await FourMica.connect(spend=spend) as client:
        print("signing as", client.address, "on", client.network)

        deposit = await client.deposit(os.environ.get("DEPOSIT", "1 USDC"))
        print("deposit", deposit.status, deposit.explorer_url or deposit.tx_hash)

        for symbol, balance in (await client.balance()).items():
            print(symbol, "available:", balance.available, "locked:", balance.locked)

        url = os.environ.get("PAID_URL")
        if url:
            response = await client.fetch(url)
            print(response.status_code, "paid:", client.payment_for(response))


if __name__ == "__main__":
    asyncio.run(main())

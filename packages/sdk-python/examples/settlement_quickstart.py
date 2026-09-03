"""Settle a committed clearing cycle from either side.

Env: 4MICA_NETWORK (or 4MICA_RPC_URL), 4MICA_WALLET_PRIVATE_KEY, CYCLE_ID
(text id or 0x-prefixed on-chain id), and ROLE=pay|claim.
"""

import asyncio
import os

from fourmica_sdk import Client, ConfigBuilder, Erc20AllowanceRequiredError


async def main() -> None:
    cfg = ConfigBuilder().from_env().build()
    cycle_id = os.environ["CYCLE_ID"]
    role = os.environ.get("ROLE", "claim")

    async with await Client.connect(cfg) as client:
        if role == "pay":
            action = await client.settlement.pay(cycle_id).action()
            print("core prepared", action.function_name, "for", action.amount)
            try:
                receipt = await client.settlement.pay(cycle_id).send()
            except Erc20AllowanceRequiredError:
                await client.settlement.pay(cycle_id).self_funded().approve()
                receipt = await client.settlement.pay(cycle_id).send()
        else:
            receipt = await client.settlement.claim(cycle_id).send()

        print("settled:", receipt.tx_hash, "route:", receipt.route.value)


if __name__ == "__main__":
    asyncio.run(main())

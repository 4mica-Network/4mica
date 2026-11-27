"""Env: FOURMICA_NETWORK (or FOURMICA_RPC_URL), FOURMICA_WALLET_PRIVATE_KEY,
RECIPIENT_ADDRESS, optional ERC20_TOKEN and AMOUNT (base units)."""

import asyncio
import json
import os

from fourmica_sdk import Client, ConfigBuilder


async def main() -> None:
    cfg = ConfigBuilder().from_env().build()
    async with await Client.connect(cfg) as client:
        payload = await client.payment.new_payment(
            os.environ["RECIPIENT_ADDRESS"],
            int(os.environ.get("AMOUNT", "1000")),
            os.environ.get("ERC20_TOKEN"),
        )
        request = await client.payment.sign_request(payload)
        print(json.dumps(request.to_payload()))


if __name__ == "__main__":
    asyncio.run(main())

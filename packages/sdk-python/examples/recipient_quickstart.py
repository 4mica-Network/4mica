"""Env: FOURMICA_NETWORK (or FOURMICA_RPC_URL), FOURMICA_WALLET_PRIVATE_KEY,
PAYMENT_REQUEST (the JSON payer_quickstart.py prints)."""

import asyncio
import json
import os

from fourmica_sdk import Client, ConfigBuilder, PaymentRequest


async def main() -> None:
    cfg = ConfigBuilder().from_env().build()
    async with await Client.connect(cfg) as client:
        request = PaymentRequest.from_rpc(json.loads(os.environ["PAYMENT_REQUEST"]))
        receipt = await client.payment.issue_guarantee(request)
        guarantee = client.payment.verify_guarantee(receipt)
        print("guaranteed", guarantee.amount, "in cycle", hex(guarantee.cycle_id))
        print("payments received:", len(await client.payment.list_received()))


if __name__ == "__main__":
    asyncio.run(main())

"""Sign a payment guarantee request as the payer.

Env: 4MICA_NETWORK (or 4MICA_RPC_URL), 4MICA_WALLET_PRIVATE_KEY,
RECIPIENT_ADDRESS, optional ERC20_TOKEN and AMOUNT.
"""

import asyncio
import os
import secrets
import time

from fourmica_sdk import Client, ConfigBuilder, PaymentGuaranteeRequestClaims


async def main() -> None:
    cfg = ConfigBuilder().from_env().build()
    async with await Client.connect(cfg) as client:
        claims = PaymentGuaranteeRequestClaims.new(
            user_address=client.signer_address,
            recipient_address=os.environ["RECIPIENT_ADDRESS"],
            req_id=int.from_bytes(secrets.token_bytes(32), "big"),
            amount=int(os.environ.get("AMOUNT", "1000")),
            timestamp=int(time.time()),
            erc20_token=os.environ.get("ERC20_TOKEN"),
        )
        signature = await client.payment.sign_request(claims)
        print("claims:", claims.to_payload())
        print("signature:", signature.signature)
        print("hand both to the recipient, who calls payment.issue_guarantee")


if __name__ == "__main__":
    asyncio.run(main())

"""Issue and verify a payment guarantee as the recipient.

Expects the payer's claims payload fields and signature (see
payer_quickstart.py). Env: 4MICA_NETWORK (or 4MICA_RPC_URL),
4MICA_WALLET_PRIVATE_KEY, PAYER_ADDRESS, REQ_ID, AMOUNT, TIMESTAMP,
PAYER_SIGNATURE, optional ERC20_TOKEN.
"""

import asyncio
import os

from fourmica_sdk import (
    Client,
    ConfigBuilder,
    PaymentGuaranteeRequestClaims,
    PaymentSignature,
    SigningScheme,
)


async def main() -> None:
    cfg = ConfigBuilder().from_env().build()
    async with await Client.connect(cfg) as client:
        claims = PaymentGuaranteeRequestClaims.new(
            user_address=os.environ["PAYER_ADDRESS"],
            recipient_address=client.signer_address,
            req_id=int(os.environ["REQ_ID"], 0),
            amount=int(os.environ["AMOUNT"], 0),
            timestamp=int(os.environ["TIMESTAMP"]),
            erc20_token=os.environ.get("ERC20_TOKEN"),
        )
        signature = PaymentSignature(
            signature=os.environ["PAYER_SIGNATURE"], scheme=SigningScheme.EIP712
        )

        cert = await client.payment.issue_guarantee(claims, signature)
        verified = client.payment.verify_guarantee(cert)
        print("guaranteed", verified.amount, "in cycle", hex(verified.cycle_id))

        received = await client.payment.list_received()
        print("payments received:", len(received))


if __name__ == "__main__":
    asyncio.run(main())

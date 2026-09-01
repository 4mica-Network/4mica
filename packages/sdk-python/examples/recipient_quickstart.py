import asyncio
import os

from eth_account import Account
from fourmica_sdk import Client, ConfigBuilder

RECIPIENT_KEY = os.environ["RECIPIENT_KEY"]
USER_ADDRESS = os.environ["USER_ADDRESS"]
AMOUNT_WEI = int(os.getenv("AMOUNT_WEI", "100000000000000000"), 0)
GUARANTEE_VERSION = int(os.getenv("GUARANTEE_VERSION", "1"), 10)


async def main() -> None:
    recipient_cfg = ConfigBuilder().from_env().wallet_private_key(RECIPIENT_KEY).build()
    recipient_client = await Client.new(recipient_cfg)
    try:
        recipient_address = Account.from_key(RECIPIENT_KEY).address

        tab_id = await recipient_client.recipient.create_tab(
            user_address=USER_ADDRESS,
            recipient_address=recipient_address,
            erc20_token=None,
            ttl=None,
            guarantee_version=GUARANTEE_VERSION,
        )
        latest = await recipient_client.recipient.get_latest_guarantee(tab_id)
        req_id = latest.req_id + 1 if latest else 0
        tab = await recipient_client.recipient.get_tab(tab_id)
        asset_address = tab.asset_address if tab else None

        print("TAB_ID=", tab_id)
        print("REQ_ID=", req_id)
        print("AMOUNT_WEI=", AMOUNT_WEI)
        print("ASSET_ADDRESS=", asset_address)
        print(
            "ACCEPTED_GUARANTEE_VERSIONS=",
            recipient_client.params.accepted_guarantee_versions_or_default(),
        )
        print(
            "TRUSTED_VALIDATION_REGISTRIES=",
            recipient_client.params.trusted_validation_registries,
        )
        print("GUARANTEE_VERSION=", GUARANTEE_VERSION)
    finally:
        await recipient_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())

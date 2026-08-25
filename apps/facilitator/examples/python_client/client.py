"""Prepare and attach X-PAYMENT headers using the official Python SDK."""

import asyncio
import base64
import json
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fourmica_sdk import Client, ConfigBuilder, PaymentRequirements, X402Flow

# Load .env files
base = Path(__file__).resolve()
for path in [base.parents[1] / ".env", base.parents[2] / ".env"]:
    if path.exists():
        load_dotenv(path)

DEFAULT_ASSET_ADDRESS = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"
USDC_DECIMALS = 6
USDC_BASE_UNITS = 10**USDC_DECIMALS

payer_key = os.getenv("PAYER_KEY") or os.getenv("4MICA_WALLET_PRIVATE_KEY")
user_address = os.getenv("USER_ADDRESS")
resource_url = os.getenv("RESOURCE_URL")
# Optional override for the 4mica core API URL; defaults to SDK config/env.
rpc_url = os.getenv("4MICA_RPC_URL")
asset_address = os.getenv("ASSET_ADDRESS") or DEFAULT_ASSET_ADDRESS

if not payer_key or not user_address or not resource_url:
    raise SystemExit(
        "PAYER_KEY (or 4MICA_WALLET_PRIVATE_KEY), USER_ADDRESS, and RESOURCE_URL must be set"
    )


def _format_tx_hash(receipt: dict) -> str:
    value = receipt.get("transactionHash") or receipt.get("transaction_hash")
    if value is None:
        return "<unknown>"
    if isinstance(value, (bytes, bytearray)):
        return "0x" + value.hex()
    return str(value)


async def main() -> None:
    print("--- x402 / 4mica flow (Python SDK) ---")
    print(f"SDK core API URL override (rpc_url): {rpc_url or '<from env>'}")
    env_core_api_url = os.getenv("X402_CORE_API_URL")
    env_networks = os.getenv("X402_NETWORKS")
    if env_core_api_url or env_networks:
        print(
            "SDK env config:"
            f" X402_CORE_API_URL={env_core_api_url or '<unset>'},"
            f" X402_NETWORKS={env_networks or '<unset>'}"
        )
    env_facilitator = os.getenv("FACILITATOR_URL")
    if env_facilitator:
        print(f"Facilitator URL (used by resource server): {env_facilitator}")
    print(f"Resource URL: {resource_url}")
    cfg_builder = ConfigBuilder().from_env().wallet_private_key(payer_key)
    if rpc_url:
        cfg_builder = cfg_builder.rpc_url(rpc_url)
    cfg = cfg_builder.build()
    client = await Client.new(cfg)

    usdc_amount = 1 * USDC_BASE_UNITS
    print(f"Approving 1 USDC ({usdc_amount} base units) for deposit...")
    approve_receipt = await client.user.approve_erc20(asset_address, usdc_amount)
    print(f"Approval tx hash: {_format_tx_hash(approve_receipt)}")
    print("Depositing 1 USDC collateral...")
    deposit_receipt = await client.user.deposit(usdc_amount, asset_address)
    print(f"Deposit tx hash: {_format_tx_hash(deposit_receipt)}")

    flow = X402Flow.from_client(client)

    try:
        async with httpx.AsyncClient() as http:
            resp = await http.get(resource_url)
            if resp.status_code != 402:
                raise SystemExit(
                    f"expected HTTP 402 from the resource, got {resp.status_code}"
                )
            body = resp.json()
            accepts = body.get("accepts") or []
            if not accepts:
                raise SystemExit(
                    "resource did not return any payment requirements in 'accepts'"
                )
            requirements = PaymentRequirements.from_raw(accepts[0])

            payment = await flow.sign_payment(requirements, user_address)
            decoded = json.loads(base64.b64decode(payment.header).decode())

            print(f"\nX-PAYMENT header:\n{payment.header}\n")
            print("Decoded header:")
            print(json.dumps(decoded, indent=2))

            if asset_address and payment.claims.asset_address.lower() != asset_address.lower():
                print(
                    "warning: claims.asset_address does not match ASSET_ADDRESS "
                    f"({payment.claims.asset_address} != {asset_address})"
                )

            resource_resp = await http.get(
                resource_url, headers={"X-PAYMENT": payment.header}
            )
            print("\nResponse from resource server:\n")
            try:
                print(json.dumps(resource_resp.json(), indent=2))
            except ValueError:
                print(resource_resp.text)
    finally:
        await flow.http.aclose()
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())

import os

from dotenv import load_dotenv
from x402 import x402ClientSync
from x402.http.clients import x402_requests

from fourmica_x402.client_scheme import FourMicaEvmScheme

load_dotenv()

PRIVATE_KEY = os.getenv("PRIVATE_KEY")
if not PRIVATE_KEY or not PRIVATE_KEY.startswith("0x"):
    raise SystemExit("PRIVATE_KEY env var must be set and start with 0x")

API_URL = os.getenv("API_URL", "http://localhost:3000")
NETWORK = os.getenv("NETWORK", "eip155:11155111")
ENDPOINT = f"{API_URL}/api/premium-data"

client = x402ClientSync()
# x402 only pays in assets it recognizes by default; a local dev stack's mock
# token is not one of them.
if os.getenv("SPEND_CONTROLS", "").lower() in ("off", "false", "0"):
    client.set_spend_controls(False)
client.register(NETWORK, FourMicaEvmScheme(PRIVATE_KEY))

session = x402_requests(client)
response = session.get(ENDPOINT)
print("Status:", response.status_code)
print("Body:", response.text)

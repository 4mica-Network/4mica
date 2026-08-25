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
ENDPOINT = f"{API_URL}/api/premium-data"

client = x402ClientSync()
client.register("eip155:11155111", FourMicaEvmScheme(PRIVATE_KEY))

session = x402_requests(client)
response = session.get(ENDPOINT)
print("Status:", response.status_code)
print("Body:", response.text)

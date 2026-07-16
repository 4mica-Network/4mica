from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

# 1. Create client
client = x402ClientSync()
# 2. Register the 4Mica scheme
client.register("eip155:11155111", FourMicaEvmScheme("0xYourPrivateKey"))
# 3. Wrap requests. That's it.
session = x402_requests(client)

# Credit-based, off-chain, instant
response = session.get("https://api.example.com/data")

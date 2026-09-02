import os

from dotenv import load_dotenv
from fastapi import FastAPI

from fourmica_x402.http import fastapi_payment_middleware_from_config

load_dotenv()

app = FastAPI()

PORT = int(os.getenv("PORT", "3000"))
PAY_TO_ADDRESS = os.getenv("PAY_TO_ADDRESS")
NETWORK = os.getenv("NETWORK", "eip155:11155111")
# Point these three at a local dev stack; leave unset for the hosted defaults.
FACILITATOR_URL = os.getenv("FACILITATOR_URL")
CORE_API_URL = os.getenv("CORE_API_URL")
ASSET_ADDRESS = os.getenv("ASSET_ADDRESS")
AMOUNT_BASE_UNITS = os.getenv("AMOUNT_BASE_UNITS", "1000")

if not PAY_TO_ADDRESS:
    raise SystemExit("PAY_TO_ADDRESS env var is required")

price = {"amount": AMOUNT_BASE_UNITS, "asset": ASSET_ADDRESS} if ASSET_ADDRESS else "$0.01"

accepts = {
    "scheme": "4mica-credit",
    "price": price,
    "network": NETWORK,
    "payTo": PAY_TO_ADDRESS,
}
if CORE_API_URL:
    # The paying client resolves its core endpoint from the requirements.
    accepts["extra"] = {"rpcUrl": CORE_API_URL}

routes = {
    "GET /api/premium-data": {
        "accepts": accepts,
        "description": "Access to premium data endpoint",
    }
}

facilitator_client = None
if FACILITATOR_URL:
    from x402.http import FacilitatorConfig

    from fourmica_x402.facilitator import FourMicaFacilitatorClient

    facilitator_client = FourMicaFacilitatorClient(FacilitatorConfig(url=FACILITATOR_URL))

middleware = fastapi_payment_middleware_from_config(routes, facilitator_client=facilitator_client)


@app.middleware("http")
async def x402_middleware(request, call_next):
    return await middleware(request, call_next)


@app.get("/api/premium-data")
async def premium_data():
    return {
        "message": "Success! You've accessed the premium data.",
        "data": {
            "secret": "This is protected content behind a paywall",
        },
    }


@app.get("/")
async def root():
    return {
        "message": "x402 Demo Server",
        "endpoints": {
            "free": ["/", "/health"],
            "protected": [
                {
                    "path": "/api/premium-data",
                    "price": str(price),
                    "description": "Premium data endpoint (requires payment)",
                }
            ],
        },
    }


@app.get("/health")
async def health():
    return {"status": "ok"}

import os

from dotenv import load_dotenv
from fastapi import FastAPI

from fourmica_x402.http import fastapi_payment_middleware_from_config

load_dotenv()

app = FastAPI()

PORT = int(os.getenv("PORT", "3000"))
PAY_TO_ADDRESS = os.getenv("PAY_TO_ADDRESS")
ADVERTISED_ENDPOINT = os.getenv("ADVERTISED_ENDPOINT", f"http://localhost:{PORT}/payment/tab")

if not PAY_TO_ADDRESS:
    raise SystemExit("PAY_TO_ADDRESS env var is required")

routes = {
    "GET /api/premium-data": {
        "accepts": {
            "scheme": "4mica-credit",
            "price": "$0.01",
            "network": "eip155:11155111",
            "payTo": PAY_TO_ADDRESS,
        },
        "description": "Access to premium data endpoint",
    }
}

middleware = fastapi_payment_middleware_from_config(
    routes,
    tab_endpoint=ADVERTISED_ENDPOINT,
    ttl_seconds=3600,
)


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
                    "price": "$0.01",
                    "description": "Premium data endpoint (requires payment)",
                }
            ],
        },
    }


@app.get("/health")
async def health():
    return {"status": "ok"}

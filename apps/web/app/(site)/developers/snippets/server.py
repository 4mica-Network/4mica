from fastapi import FastAPI
from fourmica_x402.http import fastapi_payment_middleware_from_config

app = FastAPI()

# Add 4Mica middleware. The facilitator and scheme are set up for you.
middleware = fastapi_payment_middleware_from_config(
  { "GET /data": { "accepts": { "scheme": "4mica-credit",
      "price": "$0.01", "network": "eip155:84532",
      "payTo": "0xYourAddress" } } },
)

@app.middleware("http")
async def x402_mw(request, call_next):
    return await middleware(request, call_next)

@app.get("/data")
async def data():
    return {"data": "premium content"}

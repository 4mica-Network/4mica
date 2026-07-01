from fastapi import FastAPI
from fourmica_x402.http import fastapi_payment_middleware_from_config

app = FastAPI()

# Add 4Mica middleware. One line.
middleware = fastapi_payment_middleware_from_config(
  { "GET /data": { "accepts": { "scheme": "4mica-credit",
      "price": "$0.01", "network": "eip155:11155111",
      "payTo": "0xYourAddress" } } },
  tab_endpoint="https://api.example.com/tabs",
)

@app.middleware("http")
async def x402_mw(request, call_next):
    return await middleware(request, call_next)

@app.get("/data")
async def data():
    return {"data": "premium content"}

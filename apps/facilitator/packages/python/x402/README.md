# 4mica-x402

Python integration for the x402 Payment Protocol with 4mica credit flow support.

## Install

```bash
pip install 4mica-x402
```

Optional extras:
- `fastapi` (FastAPI middleware)
- `flask` (Flask middleware)
- `httpx` (async HTTP client wrapper)
- `requests` (sync HTTP client wrapper)
- `all` (everything)

## Quick Start (Server)

```python
from fastapi import FastAPI
from fourmica_x402.http import fastapi_payment_middleware_from_config

app = FastAPI()

routes = {
    "GET /premium": {
        "accepts": {
            "scheme": "4mica-credit",
            "price": "$0.01",
            "network": "eip155:84532",
            "payTo": "0xRecipient",
        }
    }
}

middleware = fastapi_payment_middleware_from_config(routes)

@app.middleware("http")
async def x402_mw(request, call_next):
    return await middleware(request, call_next)
```

## Quick Start (Client)

```python
from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

client = x402ClientSync()
client.register("eip155:84532", FourMicaEvmScheme("0xYourPrivateKey"))

session = x402_requests(client)
resp = session.get("https://api.example.com/premium")
print(resp.status_code, resp.text)
```

To pay on a self-hosted core, name it per network:
`FourMicaEvmScheme("0xYourPrivateKey", core_urls={"eip155:84532": "http://localhost:3000"})`.
A seller that advertises `extra.rpcUrl` in its requirements still takes precedence.

## Refusals

When the facilitator refuses a settlement, the seller answers `402` with the
facilitator's response, base64 JSON in the `PAYMENT-RESPONSE` header: the
reason in `errorReason`, a message in `errorMessage`, and `retryable` and
`details` under `extra`. The reasons are listed in the
[facilitator's README](../../../README.md#errors). A successful settlement
carries the guarantee receipt in `extra.receipt`.

The client scheme fixes the refusals a payer can fix and has x402 retry the
request once with a new payment: it checkpoints when core asks for one
(`invalid_4mica_credit_checkpoint_required`), relearns the active cycle and
core's clock after a cycle or timestamp refusal, and waits out a checkpoint
cutoff. Anything else, or a recovery that fails, reaches the caller as the
`402`.

## Development

```bash
python -m build
python -m pytest
```

Install dev tools:

```bash
pip install -e .[dev]
```

The end-to-end tests in `e2e/` need a local core and facilitator;
`../../e2e/stack.sh test py` brings them up and runs the tests.

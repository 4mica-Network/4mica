# Building a Paid AI API with x402 Micropayments Using 4mica SDK

Learn how to monetize your API with cryptocurrency micropayments using the HTTP 402 Payment Required protocol.

## Introduction

Imagine building an API where every request automatically handles payment, no subscription management, no invoicing, no payment processors taking 3% cuts. Just pure pay-per-use with instant settlement.

This is what the x402 protocol enables, and in this tutorial, we'll build a fully functional AI-powered NFT generator that accepts cryptocurrency micropayments using the 4mica SDK.

By the end of this tutorial, you'll have:
- A FastAPI server that generates DALL-E minion NFTs for $0.005 USDC each
- An AI agent (using LangGraph + OpenAI) that autonomously pays for and collects NFTs
- A working understanding of the x402 payment flow

Time to complete: 30 minutes
Prerequisites: Python 3.9+, basic understanding of async Python, an Ethereum wallet

## What is 4mica?

4mica is a decentralized payment network built on blockchain infrastructure that enables instant, trustless financial exchanges. At its core is the concept of credit tabs, configurable lines of credit between users and service providers.

Think of it like opening a bar tab: you deposit collateral upfront, consume services, and settle later. But unlike a bar tab, everything is cryptographically secured and verifiable on-chain.

The sdk-4mica Python library provides:
- Tab Management: Create and manage per-user credit ledgers
- Payment Guarantees: Sign and verify cryptographic payment commitments
- Multi-Asset Support: Handle ETH and ERC20 tokens (USDC, USDT)
- x402 Integration: Built-in support for the HTTP 402 Payment Required protocol
- Async/Await: All methods use asynchronous Python patterns

## Understanding the x402 Payment Flow

The x402 protocol extends HTTP with a payment layer. Here's how it works:

```
  1  +---------+                +----------+                +-------------+
  2  | Client  |                | Server   |                | Facilitator |
  3  | (Payer) |                | (Recipient)              | (4mica)     |
  4  +----+----+                +----+-----+                +------+-----+
  5       |                           |                           |
  6  1) GET /resource                 |                           |
  7  -------------------------------> |                           |
  8       |                           |                           |
  9  2) 402 Payment Required          |                           |
 10  <------------------------------- |                           |
 11     (includes payment terms + tabEndpoint)
 12       |                           |                           |
 13  3) POST /tab (server opens tab)  |                           |
 14  -------------------------------> | -------- POST /tabs ----> |
 15  <------------------------------- | <------ tabId, reqId ---- |
 16       |                           |                           |
 17  4) Sign payment locally          |                           |
 18     (X402Flow.sign_payment)       |                           |
 19       |                           |                           |
 20  5) GET /resource + X-PAYMENT     |                           |
 21  -------------------------------> |                           |
 22       |                           | 6) Verify payment         |
 23       |                           | -------- /verify -------> |
 24       |                           | <------ verified -------- |
 25       |                           | 7) Settle payment         |
 26       |                           | -------- /settle -------> |
 27       |                           | <----- certificate ------ |
 28  8) Response (resource data)      |                           |
 29  <------------------------------- |                           |
```

The beauty of this flow is that payments happen within the HTTP request lifecycle, no webhooks, no polling, no eventual consistency headaches.

## Project Setup

### 1. Install Dependencies

```bash
pip install 'sdk-4mica[bls]' fastapi uvicorn httpx langchain-openai langgraph openai python-dotenv eth-account
```

The `[bls]` extra installs `py-ecc` for BLS signature support, which enables advanced cryptographic features.

### 2. Configure Environment

Create a `.env` file:

```bash
# Server wallet (recipient)
RECIPIENT_ADDRESS=0x...your_recipient_address...
# Or derive address from a key if you prefer
# RECIPIENT_KEY=0x...your_private_key...

# Agent wallet (payer)
PAYER_KEY=0x...your_private_key...

# OpenAI for AI agent and DALL-E image generation
OPENAI_API_KEY=sk-...


# Network configuration (Polygon Amoy = eip155:80002)
USDC_ADDRESS=0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582
X402_NETWORK=eip155:80002
FACILITATOR_URL=https://x402.4mica.xyz
SERVER_URL=http://localhost:8402

# Price in base units (USDC has 6 decimals)
PRICE_USDC=5000

# Optional: override OpenAI image model
# OPENAI_IMAGE_MODEL=gpt-image-1
```

Note: We're using Polygon Amoy testnet. Get test USDC from the Polygon Faucet.

## Building the Server (Recipient)

The server generates AI-powered minion NFTs using DALL-E and accepts payments via x402.

### Configure the Payment Requirements Template

Instead of opening tabs directly with the core SDK, the resource server points clients at a `/tab` endpoint and lets the 4mica facilitator handle tab creation and verification.

```python
def _payment_requirements_template() -> Dict[str, Any]:
  return {
    "scheme": "4mica-credit",
    "network": X402_NETWORK,
    "maxAmountRequired": str(PRICE_USDC),
    "asset": USDC_ADDRESS,
    "payTo": RECIPIENT_ADDRESS,
    "description": "DALL-E minion NFT",
    "resource": "minion-nft",
    "extra": {
      "tabEndpoint": _tab_endpoint_url(),
    },
  }
```

The `extra.tabEndpoint` is required. `X402Flow` will call it automatically before signing a payment.

### Create the Tab Endpoint

When a client wants to pay, they first need a tab, a credit ledger that tracks their payments. The server opens the tab via the facilitator and returns tab details to the client:

```python
@app.post("/tab")
async def create_tab(request: TabRequest) -> JSONResponse:
  tab = await _open_tab(request.userAddress)
  requirements = _payment_requirements_template()
  extra = requirements.get("extra", {})
  extra.update(
    {
      "tabId": tab.get("tabId"),
      "nextReqId": tab.get("nextReqId"),
      "startTimestamp": str(tab.get("startTimestamp", int(time.time()))),
    }
  )
  requirements["extra"] = extra

  tab_id = extra.get("tabId")
  if tab_id:
    app.state.requirements_by_tab[str(tab_id)] = requirements

  body = {
    "tabId": tab_id,
    "userAddress": request.userAddress,
    "nextReqId": tab.get("nextReqId"),
    "paymentRequirements": requirements,
  }
  return JSONResponse(body)
```

The server caches the `paymentRequirements` by `tabId` and expects clients to call `/tab` before sending a payment.

### Implement the Paid Endpoint

The magic happens in the `/image` endpoint. It returns `402 Payment Required` if no payment is provided:

```python
@app.get("/image")
async def get_image(request: Request) -> JSONResponse:
  x_payment = request.headers.get("X-PAYMENT")

  # No payment? Return 402 with payment instructions
  if not x_payment:
    return JSONResponse(
      status_code=402,
      content={
        "error": "Payment Required",
        "paymentRequirements": _payment_requirements_template(),
      },
    )

  # Decode X-PAYMENT to a JSON payment payload
  payment_payload = _decode_payment_header(x_payment)

  tab_id = (
    payment_payload.get("payload", {})
    .get("claims", {})
    .get("tab_id")
  )
  if not tab_id:
    return JSONResponse(status_code=400, content={"error": "Missing tab_id in payment"})

  requirements = app.state.requirements_by_tab.get(str(tab_id))
  if requirements is None:
    return JSONResponse(
      status_code=400,
      content={"error": "Unknown tab. Call /tab before paying."},
    )

  # Verify payment with 4mica facilitator
  verify = await _verify_with_facilitator(payment_payload, requirements)
  if not verify.get("isValid"):
    return JSONResponse(
      status_code=402,
      content={"error": verify.get("invalidReason", "Invalid payment")},
    )

  # Settle payment
  settlement = await _settle_with_facilitator(payment_payload, requirements)
  if not settlement.get("success"):
    return JSONResponse(
      status_code=402,
      content={"error": settlement.get("error", "Settlement failed")},
    )

  # Generate the NFT with DALL-E
  img_base64, traits = await generator.generate()

  return JSONResponse(
    {
      "image": img_base64,
      "traits": traits,
      "settlement": settlement.get("certificate"),
    }
  )
```

The facilitator at https://x402.4mica.xyz handles cryptographic verification and settlement, so you don't need to implement the complex signature verification yourself. Note the `/verify` and `/settle` calls use `paymentPayload` (decoded from the header) plus the original `paymentRequirements`.

## Building the AI Agent (Payer)

Now for the fun part, an AI agent that autonomously pays for and collects NFTs.

### Set Up the X402Flow

The SDK provides `X402Flow` to handle the payment signing and tab refresh:

```python
from fourmica_sdk import Client, ConfigBuilder, X402Flow, PaymentRequirementsV1

async def get_payer_client():
  builder = ConfigBuilder().wallet_private_key(PAYER_KEY)
  if EVM_RPC_URL:
    builder = builder.ethereum_http_rpc_url(EVM_RPC_URL)
  cfg = builder.build()
  client = await Client.new(cfg)
  address = Account.from_key(PAYER_KEY).address
  flow = X402Flow.from_client(client)

  return client, address, flow
```

### Create the NFT Collection Tool

Using LangChain's `@tool` decorator, we create a function the AI agent can call:

```python
@tool
async def get_minion_nft() -> str:
  """Pay for and receive a pixelated minion NFT image."""
  client, address, flow = await get_payer_client()

  async with httpx.AsyncClient() as http:
    # Step 1: Request image, get 402
    resp = await http.get(f"{SERVER_URL}/image")

    if resp.status_code != 402:
      return json.dumps({"error": "Unexpected response"})

    # Step 2: Parse payment requirements from the 402 response
    requirements_raw = resp.json()["paymentRequirements"]
    requirements = PaymentRequirementsV1.from_raw(requirements_raw)

    # Step 3: Sign payment with X402Flow
    # X402Flow will call requirements.extra.tabEndpoint for the tab
    payment = await flow.sign_payment(requirements, address)

    # Step 4: Get image with payment header
    image_resp = await http.get(
      f"{SERVER_URL}/image",
      headers={"X-PAYMENT": payment.header}
    )

    return json.dumps(image_resp.json())
```

The `X402Flow.sign_payment()` method handles all the cryptographic complexity, creating the payment guarantee, signing it with your wallet, and encoding it as a base64 header.

### Build the LangGraph Agent

Wire everything together with LangGraph:

```python
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

def build_agent():
  llm = ChatOpenAI(model="gpt-4o", temperature=0)
  tools = [check_balance, deposit_usdc, get_minion_nft, settle_pending_payments]
  llm_with_tools = llm.bind_tools(tools)

  async def agent_node(state):
    messages = state["messages"]
    response = await llm_with_tools.ainvoke(messages)
    return {"messages": [response]}

  workflow = StateGraph(AgentState)
  workflow.add_node("agent", agent_node)
  workflow.add_node("tools", ToolNode(tools))
  workflow.set_entry_point("agent")
  workflow.add_conditional_edges("agent", should_continue)
  workflow.add_edge("tools", "agent")

  return workflow.compile()
```

## Running the Complete System

Terminal 1: Start the Server

```bash
python server.py
```

```
==================================================
  x402 Minion NFT Generator (DALL-E)
==================================================
  Network   | eip155:80002
  Price     | 0.005 USDC
  Generator | DALL-E 3
  Port      | 8402
==================================================

14:23:01 INFO     | Recipient ready: 0x742d3...
```

Terminal 2: Run the Agent

```bash
python agent.py
```

```
==================================================
  x402 Minion NFT Collector Agent
==================================================
  Server  | http://localhost:8402
  Network | Polygon Amoy
  Model   | gpt-4o
==================================================

You: get me a minion

14:23:15 DEBUG    | Requesting image...
14:23:16 INFO     | Tab created: 0x... req=0
14:23:17 DEBUG    | Signing payment...
14:23:20 DEBUG    | Generating minion NFT with DALL-E...

==================================================
  MINION #42069 [RARE]
==================================================

Image saved & opened: /tmp/minion_42069_rare.png

Traits:
  Body: yellow | Eyes: red | Goggles: gold
  Hair: mohawk | Accessory: crown
  Cyclops: No | Overalls: denim
==================================================

14:23:28 INFO     | NFT received | #42069 | RARE

Agent: I got you a rare minion! It has red eyes, gold goggles, a mohawk, and a crown. The image should have opened!
```

## Key Takeaways

- x402 enables pay-per-request APIs without traditional payment infrastructure
- 4mica SDK abstracts away the complexity of blockchain payments with a clean async Python API
- Credit tabs allow efficient batching of micropayments
- The facilitator handles verification and settlement, so you don't need to implement cryptography
- AI agents can autonomously pay for services using the X402Flow helper

## Resources

- sdk-4mica on PyPI
- 4mica Documentation
- 4mica x402 Examples
- Polygon Amoy Faucet

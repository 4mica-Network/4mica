#!/usr/bin/env python3
"""LangGraph agent that pays for NFTs using x402 + 4mica SDK."""

from __future__ import annotations

import asyncio
import base64
import json
import os
import time
from typing import List, TypedDict

import httpx
from dotenv import load_dotenv
from eth_account import Account
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from fourmica_sdk import Client, ConfigBuilder, PaymentRequirementsV1, X402Flow

load_dotenv()

SERVER_URL = os.getenv("SERVER_URL", "http://localhost:8402").rstrip("/")
PAYER_KEY = os.getenv("PAYER_KEY")
if not PAYER_KEY:
    raise RuntimeError("Set PAYER_KEY in .env")


class AgentState(TypedDict):
    messages: List[BaseMessage]


async def get_payer_client():
    cfg = ConfigBuilder().wallet_private_key(PAYER_KEY).build()
    client = await Client.new(cfg)
    address = Account.from_key(PAYER_KEY).address
    flow = X402Flow.from_client(client)
    return client, address, flow


def _save_image(image_b64: str) -> str:
    path = f"/tmp/minion_{int(time.time())}.png"
    with open(path, "wb") as handle:
        handle.write(base64.b64decode(image_b64))
    return path


@tool
async def get_minion_nft() -> str:
    """Pay for and receive a pixelated minion NFT image."""
    client, address, flow = await get_payer_client()
    try:
        async with httpx.AsyncClient() as http:
            # Step 1: Request image, get 402
            resp = await http.get(f"{SERVER_URL}/image")
            if resp.status_code != 402:
                return json.dumps({"error": f"Unexpected response: {resp.status_code}"})

            # Step 2: Parse payment requirements from the 402 response
            requirements_raw = resp.json()["paymentRequirements"]
            requirements = PaymentRequirementsV1.from_raw(requirements_raw)

            # Step 3: Sign payment with X402Flow (auto-calls /tab)
            payment = await flow.sign_payment(requirements, address)

            # Step 4: Get image with payment header
            image_resp = await http.get(
                f"{SERVER_URL}/image", headers={"X-PAYMENT": payment.header}
            )
            try:
                payload = image_resp.json()
            except json.JSONDecodeError:
                return json.dumps(
                    {
                        "error": "non-json response from server",
                        "status": image_resp.status_code,
                        "body": image_resp.text,
                    }
                )
            if image_resp.status_code != 200:
                return json.dumps({"error": payload, "status": image_resp.status_code})

            image_b64 = payload.get("image")
            if image_b64:
                path = _save_image(image_b64)
                payload["saved"] = path
            return json.dumps(payload)
    finally:
        await flow.http.aclose()
        await client.aclose()


@tool
async def check_balance() -> str:
    """Optional helper to check payer balances (stub for demo)."""
    return json.dumps({"status": "not-implemented", "hint": "Use client.user.get_user()"})


@tool
async def deposit_usdc() -> str:
    """Optional helper to deposit USDC (stub for demo)."""
    return json.dumps({"status": "not-implemented", "hint": "Use client.user.deposit()"})


@tool
async def settle_pending_payments() -> str:
    """Optional helper to settle pending payments (stub for demo)."""
    return json.dumps({"status": "not-implemented"})


def should_continue(state: AgentState):
    last = state["messages"][-1]
    if getattr(last, "tool_calls", None):
        return "tools"
    return END


def build_agent():
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    tools = [check_balance, deposit_usdc, get_minion_nft, settle_pending_payments]
    llm_with_tools = llm.bind_tools(tools)

    async def agent_node(state: AgentState):
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


async def main() -> None:
    agent = build_agent()
    while True:
        user_input = input("You: ").strip()
        if user_input.lower() in {"exit", "quit"}:
            break
        state = {"messages": [HumanMessage(content=user_input)]}
        result = await agent.ainvoke(state)
        last = result["messages"][-1]
        print("Agent:", last.content)


if __name__ == "__main__":
    asyncio.run(main())

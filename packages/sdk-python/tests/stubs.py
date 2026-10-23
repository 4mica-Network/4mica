"""Shared offline-test stubs: canned RPC/gateway doubles and ctx factory."""

from typing import Any, Callable, Dict, List, Optional

import httpx

import fourmica_sdk.client.ctx as ctx_module
from fourmica_sdk import Client
from fourmica_sdk.client.ctx import ClientCtx  # noqa: E402
from fourmica_sdk.client.facilitator import Facilitator  # noqa: E402
from fourmica_sdk.config import (
    Config,  # noqa: E402
    ConfigBuilder,
)
from fourmica_sdk.models import (  # noqa: E402
    CorePublicParameters,
    SupportedTokenInfo,
    SupportedTokensResponse,
)
from fourmica_sdk.rpc import RpcProxy
from fourmica_sdk.signing import LocalAccountSigner  # noqa: E402

# anvil key #0
TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
CONTRACT_ADDRESS = "0x00000000000000000000000000000000C04E4a1c"
CLEARING_HOUSE_ADDRESS = "0x00000000000000000000000000000000C1ea4111"
GUARANTEE_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000065E61"
# anvil key #1 stands in for the operator that signs guarantee receipts.
OPERATOR_PRIVATE_KEY = (
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
)
OPERATOR_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
TOKEN_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
TOKEN_DOMAIN = "0x" + "ab" * 32
FACILITATOR_URL = "https://facilitator.example/"


def supported_tokens(domain_separator: Optional[str] = TOKEN_DOMAIN):
    return SupportedTokensResponse(
        chain_id=84532,
        tokens=[
            SupportedTokenInfo(
                symbol="USDC",
                address=TOKEN_ADDRESS,
                decimals=6,
                domain_separator=domain_separator,
            )
        ],
    )


def attach_facilitator(ctx: ClientCtx, handler) -> None:
    """Point the ctx's facilitator at an httpx MockTransport handler."""
    ctx.facilitator = Facilitator(
        FACILITATOR_URL,
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )


class FakeRpc:
    """Canned responses for the RpcProxy surface, recording each call."""

    def __init__(self, **responses: Any) -> None:
        self.responses = responses
        self.calls: List[tuple] = []

    def _respond(self, name: str, *args: Any) -> Any:
        self.calls.append((name, *args))
        value = self.responses[name]
        if isinstance(value, Exception):
            raise value
        return value

    async def get_clearing_pay_net_debit_action(self, cycle_id, debtor):
        return self._respond("pay_action", cycle_id, debtor)

    async def get_clearing_claim_net_credit_action(self, cycle_id, creditor):
        return self._respond("claim_action", cycle_id, creditor)

    async def issue_guarantee(self, request):
        return self._respond("issue_guarantee", request)

    async def get_active_cycle(self, asset):
        return self._respond("active_cycle", asset)

    async def get_checkpoint_batch(self, payer, asset, cycle_id=None):
        return self._respond("checkpoint_batch", payer, asset, cycle_id)

    async def submit_checkpoint(self, signed):
        return self._respond("submit_checkpoint", signed)

    async def list_recipient_payments(self, recipient):
        return self._respond("recipient_payments", recipient)

    async def get_user_asset_balance(self, user, asset):
        return self._respond("asset_balance", user, asset)

    async def get_supported_tokens(self):
        return self._respond("supported_tokens")

    async def aclose(self) -> None:
        pass


class FakeGateway:
    """Records contract calls and returns canned receipts."""

    def __init__(self, allowance: int = 0) -> None:
        self.allowance = allowance
        self.calls: List[tuple] = []
        self.receipt = {"transactionHash": "0x" + "ab" * 32, "status": 1}

    async def erc20_allowance(self, token, spender):
        self.calls.append(("erc20_allowance", token, spender))
        return self.allowance

    async def approve_erc20(self, token, amount, spender=None, wait_options=None):
        self.calls.append(("approve_erc20", token, amount, spender))
        return self.receipt

    async def pay_net_debit(
        self,
        clearing_house,
        cycle_id,
        amount,
        proof,
        payable_value=0,
        wait_options=None,
    ):
        self.calls.append(
            ("pay_net_debit", clearing_house, cycle_id, amount, proof, payable_value)
        )
        return self.receipt

    async def claim_net_credit_for(
        self, clearing_house, creditor, cycle_id, amount, proof, wait_options=None
    ):
        self.calls.append(
            ("claim_net_credit_for", clearing_house, creditor, cycle_id, amount, proof)
        )
        return self.receipt

    async def deposit(self, amount, erc20_token=None, wait_options=None):
        self.calls.append(("deposit", amount, erc20_token))
        return self.receipt

    async def request_withdrawal(self, amount, erc20_token, wait_options=None):
        self.calls.append(("request_withdrawal", amount, erc20_token))
        return self.receipt

    async def cancel_withdrawal(self, erc20_token, wait_options=None):
        self.calls.append(("cancel_withdrawal", erc20_token))
        return self.receipt

    async def finalize_withdrawal(self, erc20_token, wait_options=None):
        self.calls.append(("finalize_withdrawal", erc20_token))
        return self.receipt

    async def aclose(self) -> None:
        pass


def make_public_params(**overrides: Any) -> CorePublicParameters:
    values: Dict[str, Any] = dict(
        contract_address=CONTRACT_ADDRESS,
        eip712_name="4micaClearingHouse",
        eip712_version="1",
        chain_id=84532,
        guarantee_signer=OPERATOR_ADDRESS,
        guarantee_registry_address=GUARANTEE_REGISTRY_ADDRESS,
        clearing_house_address=CLEARING_HOUSE_ADDRESS,
    )
    values.update(overrides)
    return CorePublicParameters(**values)


def make_ctx(
    rpc: Optional[FakeRpc] = None,
    gateway: Optional[FakeGateway] = None,
    public_params: Optional[CorePublicParameters] = None,
) -> ClientCtx:
    params = public_params or make_public_params()
    ctx = ClientCtx(
        cfg=Config(
            rpc_url="https://core.example/", wallet_private_key=TEST_PRIVATE_KEY
        ),
        rpc=rpc or FakeRpc(),
        auth_session=None,
        public_params=params,
        contract_address=CONTRACT_ADDRESS,
        ethereum_http_rpc_url="http://localhost:8545/",
        signer=LocalAccountSigner(TEST_PRIVATE_KEY),
    )
    if gateway is not None:
        ctx._gateway = gateway  # bypass the lazy web3 construction in tests
    return ctx


# --- a mock core over HTTP ------------------------------------------------
#
# For tests that want the real RpcProxy in the loop, so error bodies and
# query strings are exercised exactly as in production.

MOCK_CORE_CHAIN_ID = 1337
MOCK_CORE_PUBLIC_PARAMS = {
    "guarantee_signer": OPERATOR_ADDRESS,
    "contract_address": CONTRACT_ADDRESS,
    "guarantee_registry_address": GUARANTEE_REGISTRY_ADDRESS,
    "clearing_house_address": CLEARING_HOUSE_ADDRESS,
    "eip712_name": "4micaClearingHouse",
    "eip712_version": "1",
    "chain_id": MOCK_CORE_CHAIN_ID,
    "supported_payment_payload_versions": [1],
    "validators": [],
}

Handler = Callable[[httpx.Request], httpx.Response]


def ok(body) -> httpx.Response:
    return httpx.Response(200, json=body)


class MockCore:
    """Routes ``(method, path)`` to handlers and records every request."""

    def __init__(self, routes: Dict[tuple, Handler]) -> None:
        self.routes = {
            ("GET", "/core/public-params"): lambda r: ok(MOCK_CORE_PUBLIC_PARAMS)
        }
        self.routes.update(routes)
        self.requests: List[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path.startswith("/core/payers/") and path.endswith("/checkpoint-batch"):
            path = "/core/payers/{payer}/checkpoint-batch"
        handler = self.routes.get((request.method, path))
        if handler is None:
            return httpx.Response(404, json={"error": f"no route {path}"})
        return handler(request)

    def count(self, method: str, path: str) -> int:
        return sum(
            1 for r in self.requests if r.method == method and r.url.path == path
        )


async def connect(monkeypatch, core: MockCore) -> Client:
    """A real Client whose RpcProxy talks to *core*."""
    transport = httpx.MockTransport(core)
    monkeypatch.setattr(
        ctx_module, "RpcProxy", lambda url: RpcProxy(url, transport=transport)
    )
    cfg = (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .wallet_private_key(TEST_PRIVATE_KEY)
        .bearer_token("test-token")
        .build()
    )
    return await Client.connect(cfg)

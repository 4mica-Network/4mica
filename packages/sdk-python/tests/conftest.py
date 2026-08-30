import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure the source tree is importable ahead of any previously installed copy.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fourmica_sdk.client.ctx import ClientCtx  # noqa: E402
from fourmica_sdk.config import Config  # noqa: E402
from fourmica_sdk.models import CorePublicParameters  # noqa: E402
from fourmica_sdk.signing import LocalAccountSigner  # noqa: E402

# anvil key #0
TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
CONTRACT_ADDRESS = "0x00000000000000000000000000000000C04E4a1c"


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

    async def issue_guarantee(self, body):
        return self._respond("issue_guarantee", body)

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
        public_key=b"\x00" * 48,
        contract_address=CONTRACT_ADDRESS,
        eip712_name="4mica",
        eip712_version="1",
        chain_id=84532,
    )
    values.update(overrides)
    return CorePublicParameters(**values)


def make_ctx(
    rpc: Optional[FakeRpc] = None,
    gateway: Optional[FakeGateway] = None,
    public_params: Optional[CorePublicParameters] = None,
    guarantee_domain: bytes = b"\x11" * 32,
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
        guarantee_domain=guarantee_domain,
        guarantee_domains={1: guarantee_domain},
        signer=LocalAccountSigner(TEST_PRIVATE_KEY),
    )
    if gateway is not None:
        ctx._gateway = gateway  # bypass the lazy web3 construction in tests
    return ctx

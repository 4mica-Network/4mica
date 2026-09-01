import pytest

from fourmica_sdk.client import Client
from fourmica_sdk.config import Config
from fourmica_sdk.contract import ContractGateway
from fourmica_sdk.signing import CorePublicParameters


class _AllowanceCall:
    def __init__(self, values):
        self._values = values

    async def call(self):
        return self._values.pop(0)


class _Functions:
    def __init__(self, values):
        self.values = values
        self.calls = 0

    def allowance(self, _owner, _spender):
        self.calls += 1
        return _AllowanceCall(self.values)


class _Erc20:
    def __init__(self, values):
        self.functions = _Functions(values)


@pytest.mark.asyncio
async def test_wait_for_erc20_allowance_polls_until_rpc_reads_catch_up():
    gateway = object.__new__(ContractGateway)
    gateway.account = type("Account", (), {"address": "0xowner"})()
    gateway.contract_address = "0xspender"
    erc20 = _Erc20([0, 0, 10_000])

    actual = await gateway._wait_for_erc20_allowance(
        erc20, 10_000, timeout=1, poll_latency=0
    )

    assert actual == 10_000
    assert erc20.functions.calls == 3


def test_build_gateway_prefers_core_provided_rpc_url(monkeypatch):
    captured = {}

    class StubGateway:
        def __init__(self, eth_rpc_url, private_key, contract_address, chain_id):
            captured.update(
                eth_rpc_url=eth_rpc_url,
                private_key=private_key,
                contract_address=contract_address,
                chain_id=chain_id,
            )

    monkeypatch.setattr("fourmica_sdk.client.ContractGateway", StubGateway)

    cfg = Config(
        rpc_url="https://core.example",
        wallet_private_key="0x" + "1" * 64,
    )
    params = CorePublicParameters(
        public_key=b"\x01" * 48,
        contract_address="0x0000000000000000000000000000000000000001",
        ethereum_http_rpc_url="https://core-rpc.example",
        eip712_name="4Mica",
        eip712_version="1",
        chain_id=8453,
    )

    Client._build_gateway(cfg, params)

    assert captured["eth_rpc_url"] == "https://core-rpc.example"

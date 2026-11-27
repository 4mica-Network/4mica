import pytest
from live_stack import Client, client_config


@pytest.fixture
async def payer():
    client = await Client.connect(client_config("E2E_PAYER_KEY"))
    yield client
    await client.aclose()


@pytest.fixture
async def recipient():
    client = await Client.connect(client_config("E2E_RECIPIENT_KEY"))
    yield client
    await client.aclose()

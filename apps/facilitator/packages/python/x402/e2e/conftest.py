import pytest
from stack import Stack, read_stack, running_seller


@pytest.fixture(scope="session")
def stack() -> Stack:
    return read_stack()


@pytest.fixture(scope="session")
def seller(stack: Stack):
    with running_seller(stack) as url:
        yield url

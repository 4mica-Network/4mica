import asyncio
import json

import httpx
import pytest
from eth_account import Account
from eth_account.messages import encode_defunct

import fourmica_sdk.auth as auth_module
from fourmica_sdk.auth import (
    AuthClient,
    AuthNonceResponse,
    AuthSession,
    AuthTokens,
    SiweTemplate,
    build_siwe_message,
)
from fourmica_sdk.errors import (
    AuthConfigError,
    AuthDecodeError,
    AuthError,
    AuthStatusError,
    AuthTransportError,
    AuthUrlError,
)

PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

SIWE = {
    "domain": "4mica.io",
    "uri": "https://4mica.io",
    "chain_id": 84532,
    "statement": "Sign in to 4mica",
    "expiration": "2026-01-01T00:00:00Z",
    "issued_at": "2025-12-31T00:00:00Z",
}

TOKENS = {"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 600}


def template() -> SiweTemplate:
    return SiweTemplate.from_payload(SIWE)


class Server:
    def __init__(self, routes) -> None:
        self.routes = routes
        self.requests: list[tuple[str, dict]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        self.requests.append((request.url.path, body))
        answer = self.routes[request.url.path]
        if callable(answer):
            return answer(request)
        if isinstance(answer, list):
            return answer.pop(0)
        return answer

    def paths(self) -> list[str]:
        return [path for path, _ in self.requests]


def client_for(server: Server) -> AuthClient:
    return AuthClient(
        "https://auth.example",
        client=httpx.AsyncClient(
            base_url="https://auth.example/", transport=httpx.MockTransport(server)
        ),
    )


def login_server(**extra) -> Server:
    routes = {
        "/auth/nonce": httpx.Response(200, json={"nonce": "n-1", "siwe": SIWE}),
        "/auth/verify": httpx.Response(200, json=TOKENS),
    }
    routes.update(extra)
    return Server(routes)


class Clock:
    def __init__(self, now: float = 1_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock(monkeypatch) -> Clock:
    fake = Clock()
    monkeypatch.setattr(auth_module.time, "time", fake)
    return fake


class StaticSigner:
    def __init__(self, signature) -> None:
        self.signature = signature
        self.messages: list[str] = []

    @property
    def address(self) -> str:
        return ADDRESS

    async def sign_message(self, message):
        self.messages.append(message)
        return self.signature


class ScriptedClient:
    def __init__(self, refresh_error=None, logout_error=None) -> None:
        self.refresh_error = refresh_error
        self.logout_error = logout_error
        self.calls: list[str] = []
        self.issued = 0

    def _tokens(self) -> AuthTokens:
        self.issued += 1
        return AuthTokens(
            access_token=f"access-{self.issued}",
            refresh_token=f"refresh-{self.issued}",
            expires_in=120,
        )

    async def get_nonce(self, address):
        self.calls.append("nonce")
        return AuthNonceResponse(nonce="n", siwe=template())

    async def verify(self, address, message, signature):
        self.calls.append("verify")
        return self._tokens()

    async def refresh(self, refresh_token):
        self.calls.append(f"refresh:{refresh_token}")
        if self.refresh_error is not None:
            raise self.refresh_error
        return self._tokens()

    async def logout(self, refresh_token):
        self.calls.append(f"logout:{refresh_token}")
        if self.logout_error is not None:
            raise self.logout_error

    async def aclose(self):
        self.calls.append("aclose")


def test_auth_tokens_coerce_numeric_strings_and_non_string_tokens():
    tokens = AuthTokens.from_payload(
        {"access_token": 42, "refresh_token": "r", "expires_in": "300"}
    )
    assert tokens == AuthTokens(access_token="42", refresh_token="r", expires_in=300)


@pytest.mark.parametrize("field", ["access_token", "refresh_token", "expires_in"])
def test_auth_tokens_refuse_a_missing_field_by_name(field):
    payload = {key: value for key, value in TOKENS.items() if key != field}
    with pytest.raises(AuthDecodeError, match=f"missing auth token field: {field}"):
        AuthTokens.from_payload(payload)


@pytest.mark.parametrize("field", ["access_token", "refresh_token", "expires_in"])
def test_auth_tokens_treat_a_null_field_as_missing(field):
    with pytest.raises(AuthDecodeError, match=f"missing auth token field: {field}"):
        AuthTokens.from_payload({**TOKENS, field: None})


@pytest.mark.parametrize("expires_in", ["soon", "1.5", [60], {"s": 1}])
def test_auth_tokens_refuse_an_expiry_that_is_not_an_integer(expires_in):
    with pytest.raises(AuthDecodeError, match="invalid expires_in value"):
        AuthTokens.from_payload({**TOKENS, "expires_in": expires_in})


def test_siwe_template_reads_snake_case_fields():
    parsed = template()
    assert parsed.chain_id == 84532
    assert parsed.issued_at == "2025-12-31T00:00:00Z"
    assert parsed.domain == "4mica.io"


def test_siwe_template_falls_back_to_camel_case_when_the_snake_case_field_is_null():
    payload = {**SIWE, "chain_id": None, "chainId": "10", "issuedAt": "camel"}
    payload["issued_at"] = None
    parsed = SiweTemplate.from_payload(payload)
    assert parsed.chain_id == 10
    assert parsed.issued_at == "camel"


def test_siwe_template_prefers_snake_case_over_camel_case():
    parsed = SiweTemplate.from_payload({**SIWE, "chainId": 1, "issuedAt": "x"})
    assert parsed.chain_id == 84532
    assert parsed.issued_at == "2025-12-31T00:00:00Z"


@pytest.mark.parametrize(
    ("field", "named"),
    [
        ("domain", "domain"),
        ("uri", "uri"),
        ("statement", "statement"),
        ("expiration", "expiration"),
        ("issued_at", "issued_at"),
        ("chain_id", "chain_id"),
    ],
)
def test_siwe_template_names_the_first_spelling_of_a_missing_field(field, named):
    payload = {key: value for key, value in SIWE.items() if key != field}
    with pytest.raises(AuthDecodeError, match=f"missing SIWE field: {named}"):
        SiweTemplate.from_payload(payload)


@pytest.mark.parametrize("chain_id", ["mainnet", "1.0", [1]])
def test_siwe_template_refuses_a_chain_id_that_is_not_an_integer(chain_id):
    with pytest.raises(AuthDecodeError, match="invalid chain_id value"):
        SiweTemplate.from_payload({**SIWE, "chain_id": chain_id})


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        (["nonce"], "invalid nonce response payload"),
        ({"nonce": "n"}, "missing siwe template"),
        ({"nonce": "n", "siwe": None}, "missing siwe template"),
        ({"nonce": "n", "siwe": "template"}, "invalid siwe template payload"),
        ({"siwe": SIWE}, "missing nonce"),
        ({"nonce": None, "siwe": SIWE}, "missing nonce"),
    ],
    ids=["not-a-dict", "no-siwe", "null-siwe", "string-siwe", "no-nonce", "null-nonce"],
)
def test_a_malformed_nonce_response_is_a_decode_error(payload, message):
    with pytest.raises(AuthDecodeError, match=message):
        AuthNonceResponse.from_payload(payload)


def test_a_numeric_nonce_is_kept_as_its_text():
    parsed = AuthNonceResponse.from_payload({"nonce": 7, "siwe": SIWE})
    assert parsed.nonce == "7"
    assert parsed.siwe == template()


def test_the_siwe_message_follows_eip_4361_line_by_line():
    lines = build_siwe_message(template(), ADDRESS, "n-1").split("\n")
    assert lines == [
        "4mica.io wants you to sign in with your Ethereum account:",
        ADDRESS,
        "",
        "Sign in to 4mica",
        "",
        "URI: https://4mica.io",
        "Version: 1",
        "Chain ID: 84532",
        "Nonce: n-1",
        "Issued At: 2025-12-31T00:00:00Z",
        "Expiration Time: 2026-01-01T00:00:00Z",
    ]


@pytest.mark.parametrize("url", ["", "auth.example", "/auth", "https://"])
def test_an_auth_client_refuses_a_url_without_scheme_and_host(url):
    with pytest.raises(AuthUrlError, match="invalid URL"):
        AuthClient(url)


@pytest.mark.parametrize("url", ["https://auth.example/v1", "https://auth.example/v1/"])
async def test_an_auth_client_built_without_a_client_roots_paths_under_the_url(url):
    client = AuthClient(url)
    try:
        assert str(client._client.base_url) == "https://auth.example/v1/"
        assert client._client.timeout.read == 20.0
    finally:
        await client.aclose()
    assert client._client.is_closed


async def test_the_auth_client_posts_each_call_to_its_endpoint_with_its_body():
    server = login_server(
        **{
            "/auth/refresh": httpx.Response(200, json=TOKENS),
            "/auth/logout": httpx.Response(200, json={"revoked": True}),
        }
    )
    client = client_for(server)
    nonce = await client.get_nonce(ADDRESS)
    tokens = await client.verify(ADDRESS, "msg", "0xsig")
    refreshed = await client.refresh("refresh-1")
    assert await client.logout("refresh-1") is None
    assert nonce.nonce == "n-1"
    assert tokens == refreshed == AuthTokens("access-1", "refresh-1", 600)
    assert server.requests == [
        ("/auth/nonce", {"address": ADDRESS}),
        (
            "/auth/verify",
            {"address": ADDRESS, "message": "msg", "signature": "0xsig"},
        ),
        ("/auth/refresh", {"refresh_token": "refresh-1"}),
        ("/auth/logout", {"refresh_token": "refresh-1"}),
    ]


@pytest.mark.parametrize(
    ("path", "call", "message"),
    [
        ("/auth/nonce", lambda c: c.get_nonce(ADDRESS), "invalid nonce response"),
        (
            "/auth/verify",
            lambda c: c.verify(ADDRESS, "m", "s"),
            "invalid verify response",
        ),
        ("/auth/refresh", lambda c: c.refresh("r"), "invalid refresh response"),
    ],
)
@pytest.mark.parametrize("body", [b'[{"a": 1}]', b'"tokens"', b"1", b"null"])
async def test_a_successful_answer_that_is_not_an_object_is_a_decode_error(
    path, call, message, body
):
    client = client_for(Server({path: httpx.Response(200, content=body)}))
    with pytest.raises(AuthDecodeError, match=message):
        await call(client)


async def test_a_successful_answer_with_invalid_json_names_the_url():
    client = client_for(Server({"/auth/refresh": httpx.Response(200, text="{")}))
    with pytest.raises(
        AuthDecodeError,
        match=r"invalid JSON response from https://auth.example/auth/refresh",
    ):
        await client.refresh("r")


@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (httpx.Response(403, json={"error": "denied", "message": "m"}), "403: denied"),
        (httpx.Response(400, json={"message": "bad nonce"}), "400: bad nonce"),
        (
            httpx.Response(400, json={"error": "", "message": "fallback"}),
            "400: fallback",
        ),
        (httpx.Response(422, json={"detail": "x"}), "422: {'detail': 'x'}"),
        (httpx.Response(500, json=["boom"]), "500: unknown error"),
        (httpx.Response(502, text="   "), "502: unknown error"),
        (httpx.Response(503, text="  bad gateway \n"), "503: bad gateway"),
        (httpx.Response(504, json="timeout"), "504: timeout"),
    ],
    ids=[
        "error-wins",
        "message",
        "empty-error",
        "other-object",
        "list",
        "blank-text",
        "text",
        "json-string",
    ],
)
async def test_a_failed_answer_becomes_a_status_error_with_the_best_message(
    response, expected
):
    client = client_for(Server({"/auth/logout": response}))
    with pytest.raises(AuthStatusError) as raised:
        await client.logout("r")
    assert str(raised.value) == expected
    assert raised.value.status_code == response.status_code


@pytest.mark.parametrize(
    "error",
    [
        httpx.ConnectError("refused"),
        httpx.ReadTimeout("slow"),
        httpx.RemoteProtocolError("eof"),
    ],
)
async def test_a_transport_failure_is_an_auth_transport_error(error):
    def fail(request):
        raise error

    client = client_for(Server({"/auth/verify": fail}))
    with pytest.raises(AuthTransportError, match=str(error)) as raised:
        await client.verify(ADDRESS, "m", "s")
    assert raised.value.__cause__ is error


def test_a_session_needs_a_key_or_a_signer():
    with pytest.raises(AuthConfigError, match="wallet_private_key or evm_signer"):
        AuthSession(ScriptedClient())
    with pytest.raises(AuthConfigError, match="wallet_private_key or evm_signer"):
        AuthSession(ScriptedClient(), wallet_private_key="")


def test_a_session_with_an_invalid_key_reports_a_config_error():
    with pytest.raises(AuthConfigError, match="invalid wallet private key"):
        AuthSession(ScriptedClient(), wallet_private_key="0x1234")


def test_a_negative_refresh_margin_is_refused_before_the_key_is_checked():
    with pytest.raises(AuthConfigError, match="cannot be negative"):
        AuthSession(ScriptedClient(), refresh_margin_secs=-1)


def test_an_explicit_signer_takes_precedence_over_a_private_key():
    signer = StaticSigner("0x" + "11" * 65)
    session = AuthSession(
        ScriptedClient(),
        wallet_private_key="0x" + "22" * 32,
        evm_signer=signer,
    )
    assert session._address == ADDRESS
    assert session._signer is signer


async def test_a_real_login_signs_the_siwe_message_with_the_wallet_key(clock):
    server = login_server()
    session = AuthSession(client_for(server), PRIVATE_KEY)
    tokens = await session.login()
    assert tokens.access_token == "access-1"
    assert server.paths() == ["/auth/nonce", "/auth/verify"]
    verify = server.requests[1][1]
    assert verify["address"] == ADDRESS
    assert verify["message"] == build_siwe_message(template(), ADDRESS, "n-1")
    assert verify["signature"].startswith("0x")
    assert len(verify["signature"]) == 132
    recovered = Account.recover_message(
        encode_defunct(text=verify["message"]), signature=verify["signature"]
    )
    assert recovered == ADDRESS


@pytest.mark.parametrize(
    ("signature", "sent"),
    [
        (b"\xab" * 65, "0x" + "ab" * 65),
        ("cd" * 65, "0x" + "cd" * 65),
        ("0x" + "ef" * 65, "0x" + "ef" * 65),
    ],
    ids=["bytes", "bare-hex", "prefixed-hex"],
)
async def test_every_signature_shape_is_sent_with_exactly_one_0x_prefix(
    clock, signature, sent
):
    server = login_server()
    signer = StaticSigner(signature)
    session = AuthSession(client_for(server), evm_signer=signer)
    await session.login()
    assert server.requests[1][1]["signature"] == sent
    assert signer.messages == [server.requests[1][1]["message"]]


async def test_a_cached_token_is_reused_until_the_refresh_margin(clock):
    client = ScriptedClient()
    session = AuthSession(
        client, evm_signer=StaticSigner("0x00"), refresh_margin_secs=60
    )
    assert await session.access_token() == "access-1"
    clock.now += 59
    assert await session.access_token() == "access-1"
    clock.now += 1
    assert await session.access_token() == "access-2"
    assert client.calls == ["nonce", "verify", "refresh:refresh-1"]


async def test_a_zero_margin_keeps_the_token_until_the_exact_expiry(clock):
    client = ScriptedClient()
    session = AuthSession(
        client, evm_signer=StaticSigner("0x00"), refresh_margin_secs=0
    )
    await session.access_token()
    clock.now += 119.999
    assert await session.access_token() == "access-1"
    clock.now += 0.001
    assert await session.access_token() == "access-2"


async def test_a_negative_lifetime_is_treated_as_already_expired(clock):
    client = ScriptedClient()
    session = AuthSession(
        client, evm_signer=StaticSigner("0x00"), refresh_margin_secs=0
    )
    session._cache_tokens(AuthTokens("a", "r", -500))
    assert session._expires_at == clock.now
    assert await session.access_token() == "access-1"
    assert client.calls == ["refresh:r"]


async def test_a_refresh_rejected_as_unauthorized_falls_back_to_a_fresh_login(clock):
    client = ScriptedClient(
        refresh_error=AuthStatusError("401: expired", status_code=401)
    )
    session = AuthSession(client, evm_signer=StaticSigner("0x00"))
    await session.login()
    clock.now += 1_000
    assert await session.access_token() == "access-2"
    assert client.calls == ["nonce", "verify", "refresh:refresh-1", "nonce", "verify"]


@pytest.mark.parametrize("status", [400, 403, 500, None])
async def test_a_refresh_failure_other_than_unauthorized_is_raised(clock, status):
    error = AuthStatusError("nope", status_code=status)
    client = ScriptedClient(refresh_error=error)
    session = AuthSession(client, evm_signer=StaticSigner("0x00"))
    await session.login()
    clock.now += 1_000
    with pytest.raises(AuthStatusError) as raised:
        await session.access_token()
    assert raised.value is error
    assert session._tokens.refresh_token == "refresh-1"
    assert client.calls.count("verify") == 1


async def test_a_refresh_transport_failure_is_not_retried_as_a_login(clock):
    client = ScriptedClient(refresh_error=AuthTransportError("down"))
    session = AuthSession(client, evm_signer=StaticSigner("0x00"))
    await session.login()
    clock.now += 1_000
    with pytest.raises(AuthTransportError):
        await session.access_token()
    assert client.calls == ["nonce", "verify", "refresh:refresh-1"]


async def test_concurrent_expired_callers_share_one_refresh(clock):
    client = ScriptedClient()
    session = AuthSession(client, evm_signer=StaticSigner("0x00"))
    await session.login()
    clock.now += 1_000
    tokens = await asyncio.gather(*(session.access_token() for _ in range(5)))
    assert tokens == ["access-2"] * 5
    assert client.calls == ["nonce", "verify", "refresh:refresh-1"]


async def test_logout_without_a_login_contacts_nobody(clock):
    client = ScriptedClient()
    session = AuthSession(client, evm_signer=StaticSigner("0x00"))
    await session.logout()
    assert client.calls == []


async def test_logout_revokes_the_refresh_token_and_forces_a_new_login(clock):
    client = ScriptedClient()
    session = AuthSession(client, evm_signer=StaticSigner("0x00"))
    await session.login()
    await session.logout()
    assert session._tokens is None
    assert session._expires_at is None
    assert await session.access_token() == "access-2"
    assert client.calls == ["nonce", "verify", "logout:refresh-1", "nonce", "verify"]


async def test_a_failed_logout_still_forgets_the_tokens(clock):
    client = ScriptedClient(logout_error=AuthTransportError("down"))
    session = AuthSession(client, evm_signer=StaticSigner("0x00"))
    await session.login()
    with pytest.raises(AuthTransportError):
        await session.logout()
    assert session._tokens is None
    assert session._valid_tokens() is None


async def test_closing_a_session_closes_its_client():
    client = ScriptedClient()
    session = AuthSession(client, evm_signer=StaticSigner("0x00"))
    await session.aclose()
    assert client.calls == ["aclose"]


def test_auth_errors_share_one_base_and_status_errors_carry_the_code():
    for error in (
        AuthConfigError,
        AuthDecodeError,
        AuthStatusError,
        AuthTransportError,
        AuthUrlError,
    ):
        assert issubclass(error, AuthError)
    assert AuthStatusError("x").status_code is None

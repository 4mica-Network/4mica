from __future__ import annotations

import asyncio
import contextlib
import secrets
import time
from collections.abc import Awaitable, Callable
from http import HTTPStatus
from typing import Any, Literal
from weakref import WeakKeyDictionary

import httpx

from ..amounts import format_units
from ..app.client import AppClient, AppError
from ..app.models import SpendAuthorization
from ..errors import SpendAccountingError, SpendAuthorizationError
from ..models import ZERO_ADDRESS
from .models import AccountingStatus, AssetRef, GovernanceOptions, GovernanceOutcome
from .protocols import PaymentTerms

ACCOUNTING_ATTEMPTS = 3
ACCOUNTING_BASE_DELAY_SECS = 0.25

_sleep = asyncio.sleep
_random = secrets.SystemRandom()


def _is_transient(error: AppError) -> bool:
    return (
        error.status is None
        or error.status == HTTPStatus.TOO_MANY_REQUESTS
        or error.status >= HTTPStatus.INTERNAL_SERVER_ERROR
    )


def _backoff(attempt: int) -> float:
    return ACCOUNTING_BASE_DELAY_SECS * (1 << (attempt - 1)) * _random.uniform(0.5, 1.0)


class SpendGovernor:
    def __init__(self, options: GovernanceOptions, http: httpx.AsyncClient) -> None:
        self._app = AppClient(
            options.api_key, base_url=options.base_url, http_client=http
        )
        self._agent_id = options.agent_id
        self._approval_timeout = options.approval_timeout_secs
        self._poll_interval = options.poll_interval_secs
        self._on_accounting_error = options.on_accounting_error
        self._outcomes: WeakKeyDictionary[httpx.Response, GovernanceOutcome] = (
            WeakKeyDictionary()
        )

    def outcome(self, response: httpx.Response) -> GovernanceOutcome | None:
        return self._outcomes.get(response)

    def record(self, response: httpx.Response, outcome: GovernanceOutcome) -> None:
        self._outcomes[response] = outcome

    async def authorize(
        self, *, terms: PaymentTerms, asset: AssetRef, payer_address: str, url: str
    ) -> SpendAuthorization:
        """Raises :class:`SpendAuthorizationError` when the organization's
        policies deny the payment or no approval comes in time."""
        address = asset.address.lower()
        authorization = await self._app.authorize_spend(
            network=terms.network,
            asset_address=None if address == ZERO_ADDRESS else address,
            amount=format_units(terms.amount, asset.decimals),
            payer_address=payer_address,
            recipient_address=terms.pay_to,
            agent_id=self._agent_id,
        )

        deadline = time.monotonic() + self._approval_timeout
        while authorization["status"] == "PENDING_APPROVAL":
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                await self.release(authorization["id"])
                raise SpendAuthorizationError(
                    "approval_timeout",
                    url,
                    authorization["id"],
                    authorization["deniedReason"],
                    authorization["approvalRequestId"],
                )
            await _sleep(min(self._poll_interval, remaining))
            authorization = await self._app.get_spend_authorization(authorization["id"])

        if authorization["status"] != "RESERVED":
            raise SpendAuthorizationError(
                "denied",
                url,
                authorization["id"],
                authorization["deniedReason"] or authorization["status"].lower(),
                authorization["approvalRequestId"],
            )
        return authorization

    async def consume(
        self, authorization_id: str, req_id: str | None = None
    ) -> AccountingStatus:
        return await self._transition(
            "consume",
            authorization_id,
            lambda: self._app.consume_spend_authorization(
                authorization_id, req_id=req_id
            ),
            req_id,
        )

    async def release(self, authorization_id: str) -> AccountingStatus:
        return await self._transition(
            "release",
            authorization_id,
            lambda: self._app.release_spend_authorization(authorization_id),
        )

    async def _transition(
        self,
        name: Literal["consume", "release"],
        authorization_id: str,
        call: Callable[[], Awaitable[Any]],
        req_id: str | None = None,
    ) -> AccountingStatus:
        attempt = 0
        while True:
            attempt += 1
            try:
                await call()
            except AppError as error:
                if not _is_transient(error) or attempt == ACCOUNTING_ATTEMPTS:
                    self._report(name, authorization_id, "failed", error, req_id)
                    return "failed"
                try:
                    await _sleep(_backoff(attempt))
                except asyncio.CancelledError:
                    self._report(name, authorization_id, "pending", error, req_id)
                    raise
            except asyncio.CancelledError as cancelled:
                self._report(name, authorization_id, "pending", cancelled, req_id)
                raise
            else:
                return "recorded"

    def _report(
        self,
        name: Literal["consume", "release"],
        authorization_id: str,
        accounting: Literal["pending", "failed"],
        cause: BaseException,
        req_id: str | None,
    ) -> None:
        if self._on_accounting_error is None:
            return
        with contextlib.suppress(Exception):
            self._on_accounting_error(
                SpendAccountingError(name, authorization_id, accounting, cause, req_id)
            )

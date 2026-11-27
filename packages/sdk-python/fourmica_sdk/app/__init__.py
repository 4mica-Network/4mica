"""The 4Mica app API, for sellers: what a listing or agent is, who may pay
it, and reporting the payments it took::

    from fourmica_sdk.app import AppClient, parse_settlement

    async with AppClient(api_key) as app:
        settled = parse_settlement(context)  # in an x402 after-settle hook
        await app.report_payment(
            req_id=settled.req_id,
            payer_address=settled.payer_address,
            recipient_address=pay_to,
            network="base-sepolia",
            amount=settled.amount,
            guarantee_claims=settled.guarantee_claims,
            guarantee_signature=settled.guarantee_signature,
        )
"""

from .client import DEFAULT_APP_BASE_URL, AppClient, AppError
from .models import (
    AppAgent,
    AppAgentStatus,
    AppFaq,
    AppIssue,
    AppListing,
    AppNetwork,
    AppPayment,
    AppPaymentStatus,
    AppPolicy,
    AppVisibility,
    CouponSkippedReason,
    CustomerDeniedReason,
    CustomerResolution,
    ReportedPayment,
    ResourceContext,
    ResourceKind,
)
from .networks import from_app_network, to_app_network
from .payment import (
    ParsedPayment,
    SettledPayment,
    parse_payment_header,
    parse_settlement,
    payment_from_header,
)

__all__ = [
    "DEFAULT_APP_BASE_URL",
    "AppAgent",
    "AppAgentStatus",
    "AppClient",
    "AppError",
    "AppFaq",
    "AppIssue",
    "AppListing",
    "AppNetwork",
    "AppPayment",
    "AppPaymentStatus",
    "AppPolicy",
    "AppVisibility",
    "CouponSkippedReason",
    "CustomerDeniedReason",
    "CustomerResolution",
    "ParsedPayment",
    "ReportedPayment",
    "ResourceContext",
    "ResourceKind",
    "SettledPayment",
    "from_app_network",
    "parse_payment_header",
    "parse_settlement",
    "payment_from_header",
    "to_app_network",
]

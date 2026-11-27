"""What the 4Mica app API answers, as it sends it: camelCase keys, amounts
and timestamps as strings."""

from __future__ import annotations

from typing import List, Literal, Optional, TypedDict

ResourceKind = Literal["listing", "agent"]
AppNetwork = Literal["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"]
AppVisibility = Literal["PRIVATE", "UNLISTED", "PUBLIC"]
AppAgentStatus = Literal["PENDING", "ACTIVE", "SUSPENDED"]
AppPaymentStatus = Literal["PENDING", "SETTLED", "FAILED"]
CustomerDeniedReason = Literal[
    "customer_blocked",
    "customer_suspended",
    "identity_blocked",
    "below_minimum",
    "daily_limit_exceeded",
    "monthly_limit_exceeded",
]
CouponSkippedReason = Literal["unknown", "revoked", "expired", "exhausted"]


class AppListing(TypedDict):
    id: str
    slug: str
    name: str
    summary: Optional[str]
    description: Optional[str]
    url: Optional[str]
    method: str
    docsUrl: Optional[str]
    category: Optional[str]
    tags: List[str]
    priceLabel: Optional[str]
    visibility: AppVisibility
    publishedAt: Optional[str]
    walletId: Optional[str]
    network: Optional[AppNetwork]
    payToAddress: Optional[str]
    assetAddress: Optional[str]
    assetDecimals: Optional[int]
    """Prices an x402 route in base units: ``to_base_units(priceAmount, assetDecimals)``."""
    priceAmount: Optional[str]
    priceCurrency: Optional[str]
    x402Endpoint: Optional[str]
    createdAt: str
    updatedAt: str


class AppAgent(TypedDict):
    id: str
    slug: Optional[str]
    name: str
    headline: Optional[str]
    description: Optional[str]
    avatarUrl: Optional[str]
    docsUrl: Optional[str]
    status: AppAgentStatus
    visibility: AppVisibility
    network: AppNetwork
    walletAddress: Optional[str]
    payerWalletId: Optional[str]
    creditLimit: str
    walletId: Optional[str]
    payToAddress: Optional[str]
    assetAddress: Optional[str]
    assetDecimals: Optional[int]
    priceAmount: Optional[str]
    priceCurrency: Optional[str]
    priceLabel: Optional[str]
    endpointUrl: Optional[str]
    x402Endpoint: Optional[str]
    publishedAt: Optional[str]
    createdAt: str
    updatedAt: str


class AppPolicy(TypedDict):
    id: str
    policyEnabled: bool
    faqEnabled: bool
    refundPolicy: Optional[str]
    uptimeTarget: Optional[str]
    supportResponse: Optional[str]
    supportEmail: Optional[str]
    rateLimit: Optional[str]
    dataRetention: Optional[str]
    testEndpoint: Optional[str]
    termsUrl: Optional[str]
    privacyUrl: Optional[str]
    statusUrl: Optional[str]
    createdAt: str
    updatedAt: str


class AppFaq(TypedDict):
    id: str
    question: str
    answer: str
    sortOrder: int
    createdAt: str
    updatedAt: str


class ResourceContext(TypedDict):
    kind: ResourceKind
    listing: Optional[AppListing]
    agent: Optional[AppAgent]
    policy: Optional[AppPolicy]
    faqs: List[AppFaq]


class CustomerResolution(TypedDict):
    customerId: Optional[str]
    allowed: bool
    deniedReason: Optional[CustomerDeniedReason]
    needsApproval: bool
    gross: str
    quotaApplied: str
    couponApplied: str
    discountApplied: str
    creditApplied: str
    payable: str
    couponSkippedReason: Optional[CouponSkippedReason]


class AppPayment(TypedDict):
    id: str
    listingId: Optional[str]
    agentId: Optional[str]
    payerAddress: str
    recipientAddress: str
    network: AppNetwork
    assetAddress: Optional[str]
    amount: str
    status: AppPaymentStatus
    failureReason: Optional[str]
    reqId: str
    txHash: Optional[str]
    resource: Optional[str]
    description: Optional[str]
    settledAt: Optional[str]
    createdAt: str
    updatedAt: str
    listingSlug: Optional[str]
    listingName: Optional[str]
    agentSlug: Optional[str]
    agentName: Optional[str]
    direction: Literal["sent", "received"]


class ReportedPayment(TypedDict):
    payment: AppPayment
    created: bool
    """``False`` when a payment with this ``reqId`` was already reported."""


class AppIssue(TypedDict):
    path: str
    message: str

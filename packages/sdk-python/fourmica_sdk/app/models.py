from __future__ import annotations

from typing import Literal, TypedDict

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
    summary: str | None
    description: str | None
    url: str | None
    method: str
    docsUrl: str | None
    category: str | None
    tags: list[str]
    priceLabel: str | None
    visibility: AppVisibility
    publishedAt: str | None
    walletId: str | None
    network: AppNetwork | None
    payToAddress: str | None
    assetAddress: str | None
    assetDecimals: int | None
    priceAmount: str | None
    priceCurrency: str | None
    x402Endpoint: str | None
    createdAt: str
    updatedAt: str


class AppAgent(TypedDict):
    id: str
    slug: str | None
    name: str
    headline: str | None
    description: str | None
    avatarUrl: str | None
    docsUrl: str | None
    status: AppAgentStatus
    visibility: AppVisibility
    network: AppNetwork
    walletAddress: str | None
    payerWalletId: str | None
    creditLimit: str
    walletId: str | None
    payToAddress: str | None
    assetAddress: str | None
    assetDecimals: int | None
    priceAmount: str | None
    priceCurrency: str | None
    priceLabel: str | None
    endpointUrl: str | None
    x402Endpoint: str | None
    publishedAt: str | None
    createdAt: str
    updatedAt: str


class AppPolicy(TypedDict):
    id: str
    policyEnabled: bool
    faqEnabled: bool
    refundPolicy: str | None
    uptimeTarget: str | None
    supportResponse: str | None
    supportEmail: str | None
    rateLimit: str | None
    dataRetention: str | None
    testEndpoint: str | None
    termsUrl: str | None
    privacyUrl: str | None
    statusUrl: str | None
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
    listing: AppListing | None
    agent: AppAgent | None
    policy: AppPolicy | None
    faqs: list[AppFaq]


class CustomerResolution(TypedDict):
    customerId: str | None
    allowed: bool
    deniedReason: CustomerDeniedReason | None
    needsApproval: bool
    gross: str
    quotaApplied: str
    couponApplied: str
    discountApplied: str
    creditApplied: str
    payable: str
    couponSkippedReason: CouponSkippedReason | None


class AppPayment(TypedDict):
    id: str
    listingId: str | None
    agentId: str | None
    payerAddress: str
    recipientAddress: str
    network: AppNetwork
    assetAddress: str | None
    amount: str
    status: AppPaymentStatus
    failureReason: str | None
    reqId: str
    txHash: str | None
    resource: str | None
    description: str | None
    settledAt: str | None
    createdAt: str
    updatedAt: str
    listingSlug: str | None
    listingName: str | None
    agentSlug: str | None
    agentName: str | None
    direction: Literal["sent", "received"]


class ReportedPayment(TypedDict):
    payment: AppPayment
    created: bool


class AppIssue(TypedDict):
    path: str
    message: str

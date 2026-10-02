import type {
  CustomerCreditKind,
  CustomerIdentitySource,
  CustomerIdentityType,
  CustomerSort,
  CustomerStatus,
  CustomerType,
} from "@stores/customer/type";

export const TYPE_LABEL_KEYS = {
  HUMAN: "customer.type.human",
  ORGANIZATION: "customer.type.organization",
  AGENT: "customer.type.agent",
  WALLET: "customer.type.wallet",
} as const satisfies Record<CustomerType, string>;

export const STATUS_LABEL_KEYS = {
  ACTIVE: "customer.status.active",
  BLOCKED: "customer.status.blocked",
  SUSPENDED: "customer.status.suspended",
} as const satisfies Record<CustomerStatus, string>;

export const STATUS_TAG_VARIANT = {
  ACTIVE: "success",
  BLOCKED: "error",
  SUSPENDED: "warning",
} as const satisfies Record<CustomerStatus, "success" | "error" | "warning">;

export const IDENTITY_TYPE_LABEL_KEYS = {
  WALLET: "customer.identity.wallet",
  EMAIL: "customer.identity.email",
  EXTERNAL: "customer.identity.external",
} as const satisfies Record<CustomerIdentityType, string>;

export const IDENTITY_SOURCE_LABEL_KEYS = {
  MANUAL: "customer.identity.sourceManual",
  API: "customer.identity.sourceApi",
  VERIFIED: "customer.identity.sourceVerified",
  DISCOVERED: "customer.identity.sourceDiscovered",
} as const satisfies Record<CustomerIdentitySource, string>;

export const TYPE_OPTIONS = (
  ["HUMAN", "ORGANIZATION", "AGENT", "WALLET"] as const
).map((value) => ({ value, titleKey: TYPE_LABEL_KEYS[value] }));

export const STATUS_OPTIONS = (["ACTIVE", "BLOCKED", "SUSPENDED"] as const).map(
  (value) => ({ value, titleKey: STATUS_LABEL_KEYS[value] }),
);

export const QUOTA_UNIT_OPTIONS = (["REQUESTS", "AMOUNT"] as const).map(
  (value) => ({
    value,
    titleKey:
      value === "REQUESTS"
        ? "customer.policy.unitRequests"
        : "customer.policy.unitAmount",
  }),
);

export const QUOTA_PERIOD_OPTIONS = [
  { value: "DAY", titleKey: "customer.policy.periodDay" },
  { value: "WEEK", titleKey: "customer.policy.periodWeek" },
  { value: "MONTH", titleKey: "customer.policy.periodMonth" },
  { value: "TOTAL", titleKey: "customer.policy.periodTotal" },
] as const;

export const CREDIT_KIND_LABEL_KEYS = {
  PROMOTIONAL: "customer.credit.promotional",
  PREPAID: "customer.credit.prepaid",
  ADJUSTMENT: "customer.credit.adjustment",
} as const satisfies Record<CustomerCreditKind, string>;

export const CREDIT_KIND_OPTIONS = (
  ["PROMOTIONAL", "PREPAID", "ADJUSTMENT"] as const
).map((value) => ({ value, titleKey: CREDIT_KIND_LABEL_KEYS[value] }));

export const COUPON_KIND_OPTIONS = [
  { value: "PERCENT", titleKey: "customer.coupon.kindPercent" },
  { value: "FIXED", titleKey: "customer.coupon.kindFixed" },
] as const;

export const COUPON_UNUSABLE_LABEL_KEYS = {
  revoked: "customer.coupon.revoked",
  expired: "customer.coupon.expired",
  exhausted: "customer.coupon.exhausted",
} as const;

export const SORT_OPTIONS = [
  { value: "-totalSpend", titleKey: "customer.sort.spendHigh" },
  { value: "totalSpend", titleKey: "customer.sort.spendLow" },
  { value: "-recentSpend", titleKey: "customer.sort.recentHigh" },
  { value: "-txnCount", titleKey: "customer.sort.txnsHigh" },
  { value: "-lastActiveAt", titleKey: "customer.sort.lastActive" },
  { value: "name", titleKey: "customer.sort.nameAsc" },
  { value: "-createdAt", titleKey: "customer.sort.newest" },
] as const satisfies readonly { value: CustomerSort; titleKey: string }[];

export const IDENTITY_TYPE_OPTIONS = (
  ["WALLET", "EMAIL", "EXTERNAL"] as const
).map((value) => ({ value, titleKey: IDENTITY_TYPE_LABEL_KEYS[value] }));

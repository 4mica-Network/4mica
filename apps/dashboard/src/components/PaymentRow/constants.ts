import type { PaymentStatus } from "@stores/payment/type";

export const STATUS_LABEL_KEYS = {
  PENDING: "payment.status.pending",
  SETTLED: "payment.status.settled",
  FAILED: "payment.status.failed",
} as const satisfies Record<PaymentStatus, string>;

export const STATUS_TAG_VARIANT = {
  PENDING: "warning",
  SETTLED: "success",
  FAILED: "error",
} as const satisfies Record<PaymentStatus, "warning" | "success" | "error">;

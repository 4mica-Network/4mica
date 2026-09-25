import type { AgentStatus } from "@stores/agent/type";

export {
  formatPrice,
  trimAmount,
  VISIBILITY_LABEL_KEYS,
  VISIBILITY_OPTIONS,
  VISIBILITY_TAG_VARIANT,
} from "@/pages/apps/constants";

export const STATUS_LABEL_KEYS = {
  PENDING: "agent.status.pending",
  ACTIVE: "agent.status.active",
  SUSPENDED: "agent.status.suspended",
} as const satisfies Record<AgentStatus, string>;

export const STATUS_TAG_VARIANT = {
  PENDING: "warning",
  ACTIVE: "success",
  SUSPENDED: "error",
} as const satisfies Record<AgentStatus, "warning" | "success" | "error">;

export const STATUS_OPTIONS = (["PENDING", "ACTIVE"] as const).map((value) => ({
  value,
  labelKey: STATUS_LABEL_KEYS[value],
}));

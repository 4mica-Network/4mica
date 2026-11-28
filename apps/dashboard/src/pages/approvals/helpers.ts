import type { ApprovalRequest, ApprovalStatus } from "@stores/finance/type";
import { storedRequest } from "@/lib/approvalRequests";

export const STATUS_VARIANT: Record<
  ApprovalStatus,
  "default" | "neutral" | "success" | "warning" | "error"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "error",
  EXPIRED: "neutral",
  CANCELLED: "neutral",
};

export const isRequester = (
  approval: ApprovalRequest,
  userId: string | undefined,
): boolean => Boolean(userId && approval.requestedBy?.id === userId);

export const canApply = (
  approval: ApprovalRequest,
  userId: string | undefined,
): boolean =>
  approval.kind === "GOVERNANCE" &&
  approval.status === "APPROVED" &&
  !approval.executedAt &&
  isRequester(approval, userId);

export const hasStoredRequest = (id: string): boolean =>
  storedRequest(id) !== null;

export const revealedSecret = (result: unknown): string | null => {
  if (!result || typeof result !== "object") {
    return null;
  }
  const record = result as Record<string, unknown>;
  for (const key of ["plaintext", "secret", "key", "token"]) {
    if (typeof record[key] === "string" && record[key]) {
      return record[key] as string;
    }
  }
  return null;
};

export const payloadEntries = (payload: unknown): [string, string][] => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  return Object.entries(payload as Record<string, unknown>)
    .filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    )
    .map(([key, value]) => [
      key,
      typeof value === "object" ? JSON.stringify(value) : String(value),
    ]);
};

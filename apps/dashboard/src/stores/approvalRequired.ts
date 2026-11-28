import { fetchFinanceBadges } from "@stores/financeBadge/actions";
import { put } from "redux-saga/effects";
import { sentForApproval } from "@/lib/approvalRequests";

export function* handledAsApproval(
  error: unknown,
  settle: { type: string },
): Generator<unknown, boolean> {
  if (!sentForApproval(error)) {
    return false;
  }
  yield put(settle);
  yield put(fetchFinanceBadges());
  return true;
}

import * as api from "@api/finance";
import type {
  ApprovalRequest,
  CursorList,
  FinancialAlert,
} from "@stores/finance/type";
import {
  allows,
  selectActiveOrganization,
} from "@stores/organization/selector";
import {
  type OrganizationSummary,
  PERMISSION,
} from "@stores/organization/type";
import { all, call, put, select, takeLatest } from "redux-saga/effects";
import { fetchFinanceBadgesSucceeded } from "./actions";
import actionTypes from "./actionTypes";

export const BADGE_PAGE = 100;

const settle = <T>(request: Promise<T>): Promise<T | null> =>
  request.catch(() => null);

export function* fetchFinanceBadges(): Generator {
  const organization = (yield select(
    selectActiveOrganization,
  )) as OrganizationSummary | null;
  if (!organization || !allows(organization, PERMISSION.FINANCE_READ)) {
    return;
  }
  const [approvals, alerts] = (yield all([
    call(() =>
      settle(api.getApprovals({ status: "PENDING", limit: BADGE_PAGE })),
    ),
    call(() =>
      settle(api.getAlerts({ acknowledged: false, limit: BADGE_PAGE })),
    ),
  ])) as [
    CursorList<ApprovalRequest> | null,
    CursorList<FinancialAlert> | null,
  ];

  yield put(
    fetchFinanceBadgesSucceeded({
      ...(approvals ? { pendingApprovals: approvals.items.length } : {}),
      ...(alerts ? { unacknowledgedAlerts: alerts.items.length } : {}),
      more: {
        approvals: Boolean(approvals?.nextCursor),
        alerts: Boolean(alerts?.nextCursor),
      },
    }),
  );
}

export default [
  takeLatest(actionTypes.FETCH_FINANCE_BADGES_REQUESTED, fetchFinanceBadges),
];

import * as api from "@api/finance";
import i18n from "@i18n";
import { fetchFinanceBadges } from "@stores/financeBadge/actions";
import { errorCode, failureMessage } from "@stores/organization/saga";
import { definedParams, type PendingMeta } from "@stores/utils";
import { toIssueMap, toMessage } from "@utils/http-errors";
import type { Task } from "redux-saga";
import {
  call,
  cancel,
  fork,
  put,
  select,
  take,
  takeEvery,
  takeLatest,
} from "redux-saga/effects";
import {
  forgetRequest,
  sentForApproval,
  storedRequest,
} from "@/lib/approvalRequests";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  alertUpdated,
  applyApprovalSucceeded,
  approvalUpdated,
  deletePolicySucceeded,
  type FinanceList,
  type FinanceReport,
  fetchGovernanceFailed,
  fetchGovernancePending,
  fetchGovernanceSucceeded,
  fetchListFailed,
  fetchListPending,
  fetchListSucceeded,
  fetchPoliciesFailed,
  fetchPoliciesPending,
  fetchPoliciesSucceeded,
  fetchReportFailed,
  fetchReportPending,
  fetchReportSucceeded,
  financeActionFailed,
  freezePolicySucceeded,
  saveGovernanceSucceeded,
  savePolicySucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import { selectFinanceState } from "./selector";
import type {
  ApprovalRequest,
  ApprovalVote,
  CursorList,
  FinanceState,
  FinancialAlert,
  GovernanceSettings,
  ReportRange,
  SpendingPolicy,
  SpendingPolicyInput,
} from "./type";

export const FINANCE_PAGE_SIZE = 50;

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

const CODE_MESSAGES: Record<string, [string, string]> = {
  self_approval: [
    "store.finance.selfApproval",
    "You asked for this change, so someone else has to decide it.",
  ],
  already_decided: [
    "store.finance.alreadyDecided",
    "You've already decided this request.",
  ],
  approval_closed: [
    "store.finance.approvalClosed",
    "This request has already been decided, cancelled or has expired.",
  ],
  approval_invalid: [
    "store.finance.approvalInvalid",
    "This approval can no longer be used. It may have expired, been used already, or the change no longer matches what was approved.",
  ],
};

const messageFor = (error: unknown, fallback: string): string => {
  const code = errorCode(error);
  const known = code ? CODE_MESSAGES[code] : undefined;
  return known ? t(...known) : failureMessage(error, fallback);
};

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  if (sentForApproval(error)) {
    yield put(financeActionFailed("", {}, meta));
    yield put(fetchFinanceBadges());
    return;
  }
  const message = messageFor(error, fallback);
  const issues = toIssueMap(error);
  yield put(financeActionFailed(message, issues, meta));
  if (Object.keys(issues).length === 0) {
    notifyError({
      title: t("store.finance.failedTitle", "Something went wrong"),
      content: message,
    });
  }
}

export const startOfDay = (day: string): string =>
  day ? `${day}T00:00:00.000Z` : "";

export const endOfDay = (day: string): string =>
  day ? `${day}T23:59:59.999Z` : "";

export const rangeParams = (range: ReportRange) => ({
  from: startOfDay(range.from),
  to: endOfDay(range.to),
});

export function* fetchPolicies(): Generator {
  try {
    yield put(fetchPoliciesPending());
    const { items } = (yield call(api.getSpendingPolicies)) as {
      items: SpendingPolicy[];
    };
    yield put(fetchPoliciesSucceeded(items));
  } catch (error) {
    yield put(
      fetchPoliciesFailed(
        toMessage(
          error,
          t("store.finance.policiesFailed", "Couldn't load the policies."),
        ),
      ),
    );
  }
}

export function* savePolicy(action: {
  type: string;
  payload: { id?: string; data: SpendingPolicyInput };
  meta: PendingMeta;
}): Generator {
  const { id, data } = action.payload;
  try {
    const policy = (yield call(() =>
      id ? api.updateSpendingPolicy(id, data) : api.createSpendingPolicy(data),
    )) as SpendingPolicy;
    yield put(savePolicySucceeded(policy, action.meta));
    notifySuccess({
      title: id
        ? t("store.finance.policyUpdated", "Policy updated")
        : t("store.finance.policyCreated", "Policy created"),
      content: t(
        "store.finance.policySavedBody",
        "Agents that check spending before paying will follow it from now on.",
      ),
    });
  } catch (error) {
    yield* fail(
      error,
      t("store.finance.policySaveFailed", "Couldn't save the policy."),
      action.meta,
    );
  }
}

export function* deletePolicy(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.deleteSpendingPolicy(action.payload.id));
    yield put(deletePolicySucceeded(action.payload.id, action.meta));
    notifySuccess({
      title: t("store.finance.policyDeleted", "Policy deleted"),
      content: t(
        "store.finance.policyDeletedBody",
        "Its limits no longer apply.",
      ),
    });
  } catch (error) {
    yield* fail(
      error,
      t("store.finance.policyDeleteFailed", "Couldn't delete the policy."),
      action.meta,
    );
  }
}

export function* freezePolicy(action: {
  type: string;
  payload: { id: string; frozen: boolean };
  meta: PendingMeta;
}): Generator {
  const { id, frozen } = action.payload;
  try {
    const policy = (yield call(() =>
      api.freezeSpendingPolicy(id, frozen),
    )) as SpendingPolicy;
    yield put(freezePolicySucceeded(policy, action.meta));
    notifySuccess({
      title: frozen
        ? t("store.finance.frozenTitle", "Spending frozen")
        : t("store.finance.unfrozenTitle", "Spending unfrozen"),
      content: frozen
        ? t(
            "store.finance.frozenBody",
            "Agents that check before paying will be told not to spend under this policy.",
          )
        : t(
            "store.finance.unfrozenBody",
            "Agents can spend under this policy again, within its limits.",
          ),
    });
  } catch (error) {
    yield* fail(
      error,
      t("store.finance.freezeFailed", "Couldn't change the freeze."),
      action.meta,
    );
  }
}

const listRequest = (
  list: FinanceList,
  state: FinanceState,
  cursor: string | null,
) => {
  const base = { limit: FINANCE_PAGE_SIZE, ...definedParams({ cursor }) };
  if (list === "approvals") {
    return api.getApprovals({
      ...base,
      ...definedParams({ ...state.approvals.filters }),
    });
  }
  if (list === "alerts") {
    const { acknowledged, kind } = state.alerts.filters;
    return api.getAlerts({ ...base, ...definedParams({ acknowledged, kind }) });
  }
  const { status, projectId, from, to } = state.authorizations.filters;
  return api.getSpendAuthorizations({
    ...base,
    ...definedParams({
      status,
      projectId,
      from: startOfDay(from),
      to: endOfDay(to),
    }),
  });
};

const LIST_FAILURES: Record<FinanceList, [string, string]> = {
  approvals: ["store.finance.approvalsFailed", "Couldn't load the approvals."],
  alerts: ["store.finance.alertsFailed", "Couldn't load the alerts."],
  authorizations: [
    "store.finance.authorizationsFailed",
    "Couldn't load the spend checks.",
  ],
};

export function* fetchList(action: {
  type: string;
  payload: { list: FinanceList; append: boolean };
}): Generator {
  const { list, append } = action.payload;
  try {
    yield put(fetchListPending(list, append));
    const state = (yield select(selectFinanceState)) as FinanceState;
    const result = (yield call(() =>
      listRequest(list, state, append ? state[list].nextCursor : null),
    )) as CursorList<never>;
    yield put(
      fetchListSucceeded({
        list,
        items: result.items,
        nextCursor: result.nextCursor,
        append,
      }),
    );
  } catch (error) {
    yield put(
      fetchListFailed(list, toMessage(error, t(...LIST_FAILURES[list]))),
    );
  }
}

export function* decideApproval(action: {
  type: string;
  payload: { id: string; vote: ApprovalVote; comment?: string };
  meta: PendingMeta;
}): Generator {
  const { id, vote, comment } = action.payload;
  try {
    const approval = (yield call(() =>
      api.decideApproval(id, {
        vote,
        ...(comment?.trim() ? { comment: comment.trim() } : {}),
      }),
    )) as ApprovalRequest;
    yield put(approvalUpdated(approval, action.meta));
    yield put(fetchFinanceBadges());
    notifySuccess({
      title:
        vote === "APPROVE"
          ? t("store.finance.approvedTitle", "Approval recorded")
          : t("store.finance.rejectedTitle", "Request rejected"),
      content: approval.summary,
    });
  } catch (error) {
    yield* fail(
      error,
      t("store.finance.decideFailed", "Couldn't record your decision."),
      action.meta,
    );
  }
}

export function* cancelApproval(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    const approval = (yield call(() =>
      api.cancelApproval(action.payload.id),
    )) as ApprovalRequest;
    yield put(approvalUpdated(approval, action.meta));
    yield put(fetchFinanceBadges());
  } catch (error) {
    yield* fail(
      error,
      t("store.finance.cancelFailed", "Couldn't cancel the request."),
      action.meta,
    );
  }
}

export function* applyApproval(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
  onApplied?: (result: unknown) => void;
}): Generator {
  const { id } = action.payload;
  const request = storedRequest(id);
  if (!request) {
    yield put(
      financeActionFailed(
        t(
          "store.finance.applyMissing",
          "This browser doesn't have the original change. Make it again; the approval will be reused.",
        ),
        {},
        action.meta,
      ),
    );
    return;
  }
  try {
    const result = (yield call(() =>
      api.applyApprovedRequest(id, request),
    )) as unknown;
    yield put(applyApprovalSucceeded(id, action.meta));
    action.onApplied?.(result);
    notifySuccess({
      title: t("store.finance.appliedTitle", "Change applied"),
      content: request.summary,
    });
  } catch (error) {
    if (errorCode(error) === "approval_invalid") {
      forgetRequest(id);
    }
    yield* fail(
      error,
      t("store.finance.applyFailed", "Couldn't apply the change."),
      action.meta,
    );
  }
}

export function* acknowledgeAlert(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    const alert = (yield call(() =>
      api.acknowledgeAlert(action.payload.id),
    )) as FinancialAlert;
    yield put(alertUpdated(alert, action.meta));
    yield put(fetchFinanceBadges());
  } catch (error) {
    yield* fail(
      error,
      t("store.finance.acknowledgeFailed", "Couldn't acknowledge the alert."),
      action.meta,
    );
  }
}

export function* fetchReport(action: {
  type: string;
  payload: { report: FinanceReport };
}): Generator {
  const { report } = action.payload;
  try {
    yield put(fetchReportPending(report));
    const { reports } = (yield select(selectFinanceState)) as FinanceState;
    const range = rangeParams(reports.range);
    if (report === "summary") {
      const result = (yield call(() =>
        api.getFinanceSummary(range),
      )) as Awaited<ReturnType<typeof api.getFinanceSummary>>;
      yield put(fetchReportSucceeded("summary", result));
    } else if (report === "usage") {
      const { items } = (yield call(() =>
        api.getFinanceUsage({
          ...range,
          groupBy: reports.groupBy,
          direction: reports.direction,
        }),
      )) as Awaited<ReturnType<typeof api.getFinanceUsage>>;
      yield put(fetchReportSucceeded("usage", items));
    } else {
      const result = (yield call(() =>
        api.getReconciliation(range),
      )) as Awaited<ReturnType<typeof api.getReconciliation>>;
      yield put(fetchReportSucceeded("reconciliation", result));
    }
  } catch (error) {
    yield put(
      fetchReportFailed(
        report,
        toMessage(
          error,
          t("store.finance.reportFailed", "Couldn't load the report."),
        ),
      ),
    );
  }
}

export function* fetchGovernance(): Generator {
  try {
    yield put(fetchGovernancePending());
    const settings = (yield call(api.getGovernance)) as GovernanceSettings;
    yield put(fetchGovernanceSucceeded(settings));
  } catch (error) {
    yield put(
      fetchGovernanceFailed(
        toMessage(
          error,
          t(
            "store.finance.governanceFailed",
            "Couldn't load the governance settings.",
          ),
        ),
      ),
    );
  }
}

export function* saveGovernance(action: {
  type: string;
  payload: GovernanceSettings;
  meta: PendingMeta;
}): Generator {
  try {
    const settings = (yield call(() =>
      api.updateGovernance(action.payload),
    )) as GovernanceSettings;
    yield put(saveGovernanceSucceeded(settings, action.meta));
    notifySuccess({
      title: t("store.finance.governanceSaved", "Governance updated"),
      content: t(
        "store.finance.governanceSavedBody",
        "New requests follow these rules from now on.",
      ),
    });
  } catch (error) {
    yield* fail(
      error,
      t(
        "store.finance.governanceSaveFailed",
        "Couldn't save the governance settings.",
      ),
      action.meta,
    );
  }
}

const takeLatestBy = <A extends { type: string; payload: object }>(
  pattern: string,
  keyOf: (action: A) => string,
  worker: (action: A) => Generator,
) =>
  fork(function* () {
    const running = new Map<string, Task>();
    while (true) {
      const action = (yield take(pattern)) as A;
      const key = keyOf(action);
      const previous = running.get(key);
      if (previous?.isRunning()) {
        yield cancel(previous);
      }
      running.set(key, (yield fork(worker, action)) as Task);
    }
  });

export default [
  takeLatest(actionTypes.FETCH_POLICIES_REQUESTED, fetchPolicies),
  takeEvery(actionTypes.SAVE_POLICY_REQUESTED, savePolicy),
  takeEvery(actionTypes.DELETE_POLICY_REQUESTED, deletePolicy),
  takeEvery(actionTypes.FREEZE_POLICY_REQUESTED, freezePolicy),
  takeLatestBy(
    actionTypes.FETCH_LIST_REQUESTED,
    (action: Parameters<typeof fetchList>[0]) => action.payload.list,
    fetchList,
  ),
  takeEvery(actionTypes.DECIDE_APPROVAL_REQUESTED, decideApproval),
  takeEvery(actionTypes.CANCEL_APPROVAL_REQUESTED, cancelApproval),
  takeEvery(actionTypes.APPLY_APPROVAL_REQUESTED, applyApproval),
  takeEvery(actionTypes.ACKNOWLEDGE_ALERT_REQUESTED, acknowledgeAlert),
  takeLatestBy(
    actionTypes.FETCH_REPORT_REQUESTED,
    (action: Parameters<typeof fetchReport>[0]) => action.payload.report,
    fetchReport,
  ),
  takeLatest(actionTypes.FETCH_GOVERNANCE_REQUESTED, fetchGovernance),
  takeEvery(actionTypes.SAVE_GOVERNANCE_REQUESTED, saveGovernance),
];

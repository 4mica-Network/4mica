import { HttpError } from "@4mica/http";
import * as api from "@api/trust";
import i18n from "@i18n";
import { notifyError, notifySuccess } from "@utils/notification";
import { all, call, put, takeEvery, takeLatest } from "redux-saga/effects";
import {
  fetchTrustFailed,
  fetchTrustPending,
  fetchTrustSucceeded,
  type PendingMeta,
  type ResourceRef,
  replyToReviewSucceeded,
  savePolicySucceeded,
  trustActionFailed,
  updateReportSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import type { PolicyInput, ReportStatus } from "./type";

interface ApiIssue {
  path: string;
  message: string;
}

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

const toIssueMap = (error: unknown): Record<string, string> => {
  if (!(error instanceof HttpError)) {
    return {};
  }
  const issues = (error.body as { issues?: ApiIssue[] } | null)?.issues;
  return Array.isArray(issues)
    ? Object.fromEntries(issues.map((i) => [i.path, i.message]))
    : {};
};

const toMessage = (error: unknown, fallback: string): string => {
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) {
      return t(
        "store.trust.sessionExpired",
        "Your session has expired. Refresh the page and sign in again.",
      );
    }
    return (error.body as { message?: string } | null)?.message ?? fallback;
  }
  return fallback;
};

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const message = toMessage(error, fallback);
  yield put(trustActionFailed(message, toIssueMap(error), meta));

  notifyError({
    title: t("store.trust.failedTitle", "Something went wrong"),
    content: message,
  });
}

export function* fetchTrust(action: {
  type: string;
  payload: ResourceRef;
}): Generator {
  const { kind, id } = action.payload;

  try {
    yield put(fetchTrustPending());

    const [policy, summary, reviews, reports] = (yield all([
      call(() => api.getPolicy(kind, id)),
      call(() => api.getTrustSummary(kind, id)),
      call(() => api.getReviews(kind, id)),
      call(() => api.getReports(kind, id)),
    ])) as [
      Awaited<ReturnType<typeof api.getPolicy>>,
      Awaited<ReturnType<typeof api.getTrustSummary>>,
      Awaited<ReturnType<typeof api.getReviews>>,
      Awaited<ReturnType<typeof api.getReports>>,
    ];

    yield put(
      fetchTrustSucceeded({
        policy: policy.policy,
        summary,
        reviews: reviews.data,
        reports: reports.data,
      }),
    );
  } catch (error) {
    yield put(
      fetchTrustFailed(
        toMessage(
          error,
          t("store.trust.fetchFailed", "Couldn't load trust details."),
        ),
      ),
    );
  }
}

export function* savePolicy(action: {
  type: string;
  payload: { resource: ResourceRef; policy: PolicyInput };
  meta: PendingMeta;
}): Generator {
  const { resource, policy } = action.payload;

  try {
    const result = (yield call(() =>
      api.savePolicy(resource.kind, resource.id, policy),
    )) as Awaited<ReturnType<typeof api.savePolicy>>;

    yield put(savePolicySucceeded(result.policy));

    notifySuccess({
      title: t("store.trust.policySaved", "Policy updated"),
      content: t(
        "store.trust.policySavedBody",
        "Buyers see this before they pay.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't save that policy.", action.meta);
  }
}

export function* replyToReview(action: {
  type: string;
  payload: { resource: ResourceRef; reviewId: string; reply: string | null };
  meta: PendingMeta;
}): Generator {
  const { resource, reviewId, reply } = action.payload;

  try {
    const result = (yield call(() =>
      api.replyToReview(resource.kind, resource.id, reviewId, reply),
    )) as Awaited<ReturnType<typeof api.replyToReview>>;

    yield put(replyToReviewSucceeded(result.review));
  } catch (error) {
    yield* fail(error, "Couldn't post that reply.", action.meta);
  }
}

export function* updateReport(action: {
  type: string;
  payload: {
    resource: ResourceRef;
    reportId: string;
    status: Extract<ReportStatus, "ACKNOWLEDGED" | "RESOLVED">;
    resolutionNote?: string | null;
  };
  meta: PendingMeta;
}): Generator {
  const { resource, reportId, status, resolutionNote } = action.payload;

  try {
    const result = (yield call(() =>
      api.updateReport(
        resource.kind,
        resource.id,
        reportId,
        status,
        resolutionNote,
      ),
    )) as Awaited<ReturnType<typeof api.updateReport>>;

    yield put(updateReportSucceeded(result.report));
  } catch (error) {
    yield* fail(error, "Couldn't update that report.", action.meta);
  }
}

export default [
  takeLatest(actionTypes.FETCH_TRUST_REQUESTED, fetchTrust),
  takeEvery(actionTypes.SAVE_POLICY_REQUESTED, savePolicy),
  takeEvery(actionTypes.REPLY_TO_REVIEW_REQUESTED, replyToReview),
  takeEvery(actionTypes.UPDATE_REPORT_REQUESTED, updateReport),
];

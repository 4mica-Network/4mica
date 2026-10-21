import * as api from "@api/compliance";
import i18n from "@i18n";
import { updateBusinessSucceeded } from "@stores/user/actions";
import { selectBusiness } from "@stores/user/selector";
import type { Business } from "@stores/user/type";
import type { PendingMeta } from "@stores/utils";
import { toIssueMap, toMessage } from "@utils/http-errors";
import { call, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  complianceActionFailed,
  createOwnerSucceeded,
  deleteOwnerSucceeded,
  fetchComplianceFailed,
  fetchCompliancePending,
  fetchComplianceSucceeded,
  submitComplianceSucceeded,
  updateComplianceSucceeded,
  updateOwnerSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import type {
  BeneficialOwnerInput,
  ComplianceSnapshot,
  ComplianceUpdate,
} from "./type";

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const message = toMessage(error, fallback);
  yield put(complianceActionFailed(message, toIssueMap(error), meta));
  notifyError({
    title: t("store.compliance.failedTitle", "Something went wrong"),
    content: message,
  });
}

export function* fetchCompliance(): Generator {
  try {
    yield put(fetchCompliancePending());
    const snapshot = (yield call(api.getCompliance)) as ComplianceSnapshot;
    yield put(fetchComplianceSucceeded(snapshot));
  } catch (error) {
    yield put(
      fetchComplianceFailed(
        toMessage(
          error,
          t("store.compliance.fetchFailed", "Couldn't load compliance."),
        ),
      ),
    );
  }
}

export function* updateCompliance(action: {
  type: string;
  payload: ComplianceUpdate;
  meta: PendingMeta;
}): Generator {
  try {
    const snapshot = (yield call(() =>
      api.updateCompliance(action.payload),
    )) as ComplianceSnapshot;
    yield put(updateComplianceSucceeded(snapshot, action.meta));
  } catch (error) {
    yield* fail(error, "Couldn't save the compliance details.", action.meta);
  }
}

export function* submitCompliance(action: {
  type: string;
  meta: PendingMeta;
}): Generator {
  try {
    const snapshot = (yield call(api.submitCompliance)) as ComplianceSnapshot;
    yield put(submitComplianceSucceeded(snapshot, action.meta));

    const business = (yield select(selectBusiness)) as Business | null;
    if (business) {
      yield put(
        updateBusinessSucceeded(
          { ...business, kybStatus: snapshot.kybStatus },
          { section: "kyb" },
        ),
      );
    }

    notifySuccess({
      title: t("store.compliance.submitted", "Submitted for review"),
      content: t(
        "store.compliance.submittedBody",
        "Your details are locked until the review ends.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't submit for review.", action.meta);
  }
}

export function* createOwner(action: {
  type: string;
  payload: BeneficialOwnerInput;
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.createBeneficialOwner(action.payload));
    const snapshot = (yield call(api.getCompliance)) as ComplianceSnapshot;
    yield put(createOwnerSucceeded(snapshot, action.meta));
  } catch (error) {
    yield* fail(error, "Couldn't add this person.", action.meta);
  }
}

export function* updateOwner(action: {
  type: string;
  payload: { id: string; data: Partial<BeneficialOwnerInput> };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() =>
      api.updateBeneficialOwner(action.payload.id, action.payload.data),
    );
    const snapshot = (yield call(api.getCompliance)) as ComplianceSnapshot;
    yield put(updateOwnerSucceeded(snapshot, action.meta));
  } catch (error) {
    yield* fail(error, "Couldn't update this person.", action.meta);
  }
}

export function* deleteOwner(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.deleteBeneficialOwner(action.payload.id));
    const snapshot = (yield call(api.getCompliance)) as ComplianceSnapshot;
    yield put(deleteOwnerSucceeded(snapshot, action.meta));
  } catch (error) {
    yield* fail(error, "Couldn't remove this person.", action.meta);
  }
}

export default [
  takeLatest(actionTypes.FETCH_COMPLIANCE_REQUESTED, fetchCompliance),
  takeEvery(actionTypes.UPDATE_COMPLIANCE_REQUESTED, updateCompliance),
  takeLatest(actionTypes.SUBMIT_COMPLIANCE_REQUESTED, submitCompliance),
  takeEvery(actionTypes.CREATE_OWNER_REQUESTED, createOwner),
  takeEvery(actionTypes.UPDATE_OWNER_REQUESTED, updateOwner),
  takeEvery(actionTypes.DELETE_OWNER_REQUESTED, deleteOwner),
];

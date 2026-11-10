import type { PendingMeta } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  BeneficialOwnerInput,
  ComplianceSnapshot,
  ComplianceUpdate,
} from "./type";

export const compliancePendingKeys = {
  section: (section: string) => `section:${section}`,
  owner: (id: string) => `owner:${id}`,
  createOwner: "createOwner",
  submit: "submit",
} as const;

export const fetchCompliance = () => ({
  type: actionTypes.FETCH_COMPLIANCE_REQUESTED,
});

export const fetchCompliancePending = () => ({
  type: actionTypes.FETCH_COMPLIANCE_PENDING,
});

export const fetchComplianceSucceeded = (payload: ComplianceSnapshot) => ({
  type: actionTypes.FETCH_COMPLIANCE_SUCCEEDED,
  payload,
});

export const fetchComplianceFailed = (message: string) => ({
  type: actionTypes.FETCH_COMPLIANCE_FAILED,
  payload: { message },
});

export const updateCompliance = (
  payload: ComplianceUpdate,
  section: string,
) => ({
  type: actionTypes.UPDATE_COMPLIANCE_REQUESTED,
  payload,
  meta: { pendingKey: compliancePendingKeys.section(section) },
});

export const updateComplianceSucceeded = (
  payload: ComplianceSnapshot,
  meta: PendingMeta,
) => ({
  type: actionTypes.UPDATE_COMPLIANCE_SUCCEEDED,
  payload,
  meta,
});

export const submitCompliance = () => ({
  type: actionTypes.SUBMIT_COMPLIANCE_REQUESTED,
  meta: { pendingKey: compliancePendingKeys.submit },
});

export const submitComplianceSucceeded = (
  payload: ComplianceSnapshot,
  meta: PendingMeta,
) => ({
  type: actionTypes.SUBMIT_COMPLIANCE_SUCCEEDED,
  payload,
  meta,
});

export const createOwner = (payload: BeneficialOwnerInput) => ({
  type: actionTypes.CREATE_OWNER_REQUESTED,
  payload,
  meta: { pendingKey: compliancePendingKeys.createOwner },
});

export const createOwnerSucceeded = (
  payload: ComplianceSnapshot,
  meta: PendingMeta,
) => ({
  type: actionTypes.CREATE_OWNER_SUCCEEDED,
  payload,
  meta,
});

export const updateOwner = (payload: {
  id: string;
  data: Partial<BeneficialOwnerInput>;
}) => ({
  type: actionTypes.UPDATE_OWNER_REQUESTED,
  payload,
  meta: { pendingKey: compliancePendingKeys.owner(payload.id) },
});

export const updateOwnerSucceeded = (
  payload: ComplianceSnapshot,
  meta: PendingMeta,
) => ({
  type: actionTypes.UPDATE_OWNER_SUCCEEDED,
  payload,
  meta,
});

export const deleteOwner = (payload: { id: string }) => ({
  type: actionTypes.DELETE_OWNER_REQUESTED,
  payload,
  meta: { pendingKey: compliancePendingKeys.owner(payload.id) },
});

export const deleteOwnerSucceeded = (
  payload: ComplianceSnapshot,
  meta: PendingMeta,
) => ({
  type: actionTypes.DELETE_OWNER_SUCCEEDED,
  payload,
  meta,
});

export const complianceActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.COMPLIANCE_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

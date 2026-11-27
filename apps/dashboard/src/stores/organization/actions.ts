import type { PendingMeta } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  InvitationPreview,
  OrganizationList,
  OrganizationSummary,
} from "./type";

export const organizationPendingKeys = {
  create: "createOrganization",
  update: "updateOrganization",
  leave: "leaveOrganization",
  remove: "deleteOrganization",
  transfer: "transferOrganization",
  accept: "acceptInvitation",
  decline: "declineInvitation",
} as const;

export const fetchOrganizations = () => ({
  type: actionTypes.FETCH_ORGANIZATIONS_REQUESTED,
});

export const fetchOrganizationsPending = () => ({
  type: actionTypes.FETCH_ORGANIZATIONS_PENDING,
});

export const fetchOrganizationsSucceeded = (
  payload: OrganizationList & { activeId: string | null },
) => ({
  type: actionTypes.FETCH_ORGANIZATIONS_SUCCEEDED,
  payload,
});

export const fetchOrganizationsFailed = (message: string) => ({
  type: actionTypes.FETCH_ORGANIZATIONS_FAILED,
  payload: { message },
});

export const switchOrganization = (id: string) => ({
  type: actionTypes.SWITCH_ORGANIZATION_REQUESTED,
  payload: { id },
});

export const activeOrganizationSet = (id: string) => ({
  type: actionTypes.ACTIVE_ORGANIZATION_SET,
  payload: { id },
});

export const createOrganization = (payload: {
  name: string;
  handle: string;
}) => ({
  type: actionTypes.CREATE_ORGANIZATION_REQUESTED,
  payload,
  meta: { pendingKey: organizationPendingKeys.create },
});

export const createOrganizationSucceeded = (
  organization: OrganizationSummary,
  meta: PendingMeta,
) => ({
  type: actionTypes.CREATE_ORGANIZATION_SUCCEEDED,
  payload: organization,
  meta,
});

export const updateOrganization = (payload: {
  name?: string;
  handle?: string;
}) => ({
  type: actionTypes.UPDATE_ORGANIZATION_REQUESTED,
  payload,
  meta: { pendingKey: organizationPendingKeys.update },
});

export const updateOrganizationSucceeded = (
  organization: OrganizationSummary,
  meta: PendingMeta,
) => ({
  type: actionTypes.UPDATE_ORGANIZATION_SUCCEEDED,
  payload: organization,
  meta,
});

export const leaveOrganization = () => ({
  type: actionTypes.LEAVE_ORGANIZATION_REQUESTED,
  meta: { pendingKey: organizationPendingKeys.leave },
});

export const leaveOrganizationSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.LEAVE_ORGANIZATION_SUCCEEDED,
  payload: { id },
  meta,
});

export const deleteOrganization = () => ({
  type: actionTypes.DELETE_ORGANIZATION_REQUESTED,
  meta: { pendingKey: organizationPendingKeys.remove },
});

export const deleteOrganizationSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.DELETE_ORGANIZATION_SUCCEEDED,
  payload: { id },
  meta,
});

export const transferOrganization = (userId: string) => ({
  type: actionTypes.TRANSFER_ORGANIZATION_REQUESTED,
  payload: { userId },
  meta: { pendingKey: organizationPendingKeys.transfer },
});

export const transferOrganizationSucceeded = (
  userId: string,
  meta: PendingMeta,
) => ({
  type: actionTypes.TRANSFER_ORGANIZATION_SUCCEEDED,
  payload: { userId },
  meta,
});

export const organizationActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.ORGANIZATION_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const clearOrganizationIssues = () => ({
  type: actionTypes.CLEAR_ORGANIZATION_ISSUES,
});

export const fetchInvitation = (token: string) => ({
  type: actionTypes.FETCH_INVITATION_REQUESTED,
  payload: { token },
});

export const fetchInvitationSucceeded = (
  token: string,
  preview: InvitationPreview,
) => ({
  type: actionTypes.FETCH_INVITATION_SUCCEEDED,
  payload: { token, preview },
});

export const fetchInvitationFailed = (
  token: string,
  code: string,
  message: string,
) => ({
  type: actionTypes.FETCH_INVITATION_FAILED,
  payload: { token, code, message },
});

export const acceptInvitation = (token: string) => ({
  type: actionTypes.ACCEPT_INVITATION_REQUESTED,
  payload: { token },
  meta: { pendingKey: organizationPendingKeys.accept },
});

export const acceptInvitationSucceeded = (
  organization: OrganizationSummary,
  meta: PendingMeta,
) => ({
  type: actionTypes.ACCEPT_INVITATION_SUCCEEDED,
  payload: organization,
  meta,
});

export const declineInvitation = (token: string) => ({
  type: actionTypes.DECLINE_INVITATION_REQUESTED,
  payload: { token },
  meta: { pendingKey: organizationPendingKeys.decline },
});

export const declineInvitationSucceeded = (meta: PendingMeta) => ({
  type: actionTypes.DECLINE_INVITATION_SUCCEEDED,
  meta,
});

export const invitationActionFailed = (
  code: string,
  message: string,
  meta: PendingMeta,
) => ({
  type: actionTypes.INVITATION_ACTION_FAILED,
  payload: { code, message },
  meta,
});

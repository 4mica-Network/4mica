import type { RootState } from "@stores/index";
import { INITIAL_STATE } from "./reducer";
import type {
  InvitationState,
  OrganizationState,
  OrganizationSummary,
  Permission,
} from "./type";

export const selectOrganizationState = (state: RootState): OrganizationState =>
  state.organization ?? INITIAL_STATE;

export const selectOrganizations = (state: RootState): OrganizationSummary[] =>
  selectOrganizationState(state).items;

export const selectActiveOrganizationId = (state: RootState): string | null =>
  selectOrganizationState(state).activeId;

export const selectActiveOrganization = (
  state: RootState,
): OrganizationSummary | null => {
  const { items, activeId } = selectOrganizationState(state);
  return items.find((item) => item.id === activeId) ?? null;
};

export const selectPersonalOrganization = (
  state: RootState,
): OrganizationSummary | null =>
  selectOrganizations(state).find((item) => item.personal) ?? null;

export const allows = (
  organization: OrganizationSummary | null,
  permission: Permission,
): boolean =>
  organization ? organization.permissions.includes(permission) : true;

export const selectCan =
  (permission: Permission) =>
  (state: RootState): boolean =>
    allows(selectActiveOrganization(state), permission);

export const selectHasResolvedOrganizations = (state: RootState): boolean => {
  const { status } = selectOrganizationState(state);
  return status === "loaded" || status === "failed";
};

export const selectIsOrganizationPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(selectOrganizationState(state).pending[key]);

export const selectOrganizationIssues = (
  state: RootState,
): Record<string, string> => selectOrganizationState(state).issues;

export const selectInvitation = (state: RootState): InvitationState =>
  selectOrganizationState(state).invitation;

export const organizationHeaders = (
  state: RootState,
): Record<string, string> | null => {
  const id = selectActiveOrganizationId(state);
  return id ? { "X-Org-Id": id } : null;
};

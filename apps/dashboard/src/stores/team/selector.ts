import type { RootState } from "@stores/index";
import { INITIAL_STATE } from "./reducer";
import type {
  AuditLogState,
  Member,
  PendingInvitation,
  TeamState,
} from "./type";

export const selectTeamState = (state: RootState): TeamState =>
  state.team ?? INITIAL_STATE;

export const selectMembers = (state: RootState): Member[] =>
  selectTeamState(state).members;

export const selectMembersStatus = (state: RootState) =>
  selectTeamState(state).membersStatus;

export const selectMembersError = (state: RootState): string | null =>
  selectTeamState(state).membersError;

export const selectInvitations = (state: RootState): PendingInvitation[] =>
  selectTeamState(state).invitations;

export const selectInvitationsStatus = (state: RootState) =>
  selectTeamState(state).invitationsStatus;

export const selectAuditLog = (state: RootState): AuditLogState =>
  selectTeamState(state).audit;

export const selectIsTeamPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(selectTeamState(state).pending[key]);

export const selectTeamIssues = (state: RootState): Record<string, string> =>
  selectTeamState(state).issues;

export const selectTeamError = (state: RootState): string | null =>
  selectTeamState(state).error;

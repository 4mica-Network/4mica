import type { RootState } from "@stores/index";
import { INITIAL_STATE } from "./reducer";
import type { FinanceState } from "./type";

export const selectFinanceState = (state: RootState): FinanceState =>
  state.finance ?? INITIAL_STATE;

export const selectPolicies = (state: RootState) =>
  selectFinanceState(state).policies;

export const selectPoliciesStatus = (state: RootState) =>
  selectFinanceState(state).policiesStatus;

export const selectPoliciesError = (state: RootState) =>
  selectFinanceState(state).policiesError;

export const selectApprovals = (state: RootState) =>
  selectFinanceState(state).approvals;

export const selectAlerts = (state: RootState) =>
  selectFinanceState(state).alerts;

export const selectAuthorizations = (state: RootState) =>
  selectFinanceState(state).authorizations;

export const selectReports = (state: RootState) =>
  selectFinanceState(state).reports;

export const selectGovernance = (state: RootState) =>
  selectFinanceState(state).governance;

export const selectGovernanceStatus = (state: RootState) =>
  selectFinanceState(state).governanceStatus;

export const selectIsFinancePending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(selectFinanceState(state).pending[key]);

export const selectFinanceIssues = (state: RootState) =>
  selectFinanceState(state).issues;

export const selectFinanceError = (state: RootState) =>
  selectFinanceState(state).error;

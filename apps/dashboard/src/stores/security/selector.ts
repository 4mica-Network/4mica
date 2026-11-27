import type { RootState } from "@stores/index";
import { INITIAL_STATE } from "./reducer";
import type {
  Collection,
  SecurityCollections,
  SecurityFailure,
  SecurityResource,
  SecurityState,
} from "./type";

export const selectSecurityState = (state: RootState): SecurityState =>
  state.security ?? INITIAL_STATE;

export const selectSecurityCollection =
  <R extends SecurityResource>(resource: R) =>
  (state: RootState): Collection<SecurityCollections[R]> =>
    selectSecurityState(state)[resource] as Collection<SecurityCollections[R]>;

export const selectAssignablePermissions = (state: RootState) =>
  selectSecurityState(state).assignablePermissions;

export const selectSecuritySettings = (state: RootState) =>
  selectSecurityState(state).settings;

export const selectSecuritySettingsStatus = (state: RootState) =>
  selectSecurityState(state).settingsStatus;

export const selectComplianceReport = (state: RootState) =>
  selectSecurityState(state).report;

export const selectComplianceReportStatus = (state: RootState) =>
  selectSecurityState(state).reportStatus;

export const selectComplianceReportError = (state: RootState) =>
  selectSecurityState(state).reportError;

export const selectIsSecurityPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(selectSecurityState(state).pending[key]);

export const selectSecurityFailure =
  (key: string) =>
  (state: RootState): SecurityFailure | null => {
    const { failure } = selectSecurityState(state);
    return failure && failure.key === key ? failure : null;
  };

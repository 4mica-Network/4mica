import type { RootState } from "@stores/index";
import type {
  BeneficialOwner,
  ComplianceProfile,
  ComplianceState,
} from "./type";

export const selectCompliance = (state: RootState): ComplianceState =>
  state.compliance;

export const selectComplianceProfile = (
  state: RootState,
): ComplianceProfile | null => state.compliance.profile;

export const selectBeneficialOwners = (state: RootState): BeneficialOwner[] =>
  state.compliance.owners;

export const selectMissingRequirements = (state: RootState): string[] =>
  state.compliance.missing;

export const selectIsComplianceLocked = (state: RootState): boolean =>
  state.compliance.kybStatus === "PENDING" ||
  state.compliance.kybStatus === "VERIFIED";

export const selectIsComplianceLoading = (state: RootState): boolean =>
  state.compliance.isLoading;

export const selectHasLoadedCompliance = (state: RootState): boolean =>
  state.compliance.hasLoaded;

export const selectIsCompliancePending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(state.compliance.pending[key]);

export const selectComplianceError = (state: RootState): string | null =>
  state.compliance.error;

export const selectComplianceIssues = (
  state: RootState,
): Record<string, string> => state.compliance.validationIssues;

export const selectOwnershipAssigned = (state: RootState): number =>
  state.compliance.owners.reduce(
    (total, owner) => total + (owner.ownershipPercent ?? 0),
    0,
  );

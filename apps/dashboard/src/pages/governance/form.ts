import {
  GOVERNED_ACTIONS,
  type GovernanceSettings,
  type GovernedAction,
} from "@stores/finance/type";

export interface GovernanceDraft {
  approvalsRequired: string;
  governedActions: GovernedAction[];
  approvalTtlHours: string;
  financeRecipientIds: string[];
  auditRetentionDays: string;
}

export type GovernanceErrors = Partial<Record<keyof GovernanceDraft, string>>;

export const draftFromSettings = (
  settings: GovernanceSettings,
): GovernanceDraft => ({
  approvalsRequired: String(settings.approvalsRequired),
  governedActions: GOVERNED_ACTIONS.filter((action) =>
    settings.governedActions.includes(action),
  ),
  approvalTtlHours: String(settings.approvalTtlHours),
  financeRecipientIds: [...settings.financeRecipientIds],
  auditRetentionDays:
    settings.auditRetentionDays === null
      ? ""
      : String(settings.auditRetentionDays),
});

const intIn = (raw: string, min: number, max: number) => {
  const value = Number(raw.trim());
  return (
    raw.trim() !== "" && Number.isInteger(value) && value >= min && value <= max
  );
};

export const validateGovernance = (
  draft: GovernanceDraft,
  t: (key: string, options?: Record<string, unknown>) => string,
): GovernanceErrors => {
  const errors: GovernanceErrors = {};
  if (!intIn(draft.approvalTtlHours, 1, 720)) {
    errors.approvalTtlHours = t("governance.errors.ttl");
  }
  if (
    draft.auditRetentionDays.trim() &&
    !intIn(draft.auditRetentionDays, 30, 3650)
  ) {
    errors.auditRetentionDays = t("governance.errors.retention");
  }
  return errors;
};

export const toSettings = (draft: GovernanceDraft): GovernanceSettings => ({
  approvalsRequired: Number(draft.approvalsRequired),
  governedActions: draft.governedActions,
  approvalTtlHours: Number(draft.approvalTtlHours),
  financeRecipientIds: draft.financeRecipientIds,
  auditRetentionDays: draft.auditRetentionDays.trim()
    ? Number(draft.auditRetentionDays)
    : null,
});

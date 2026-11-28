import { Button, Checkbox, EmptyState } from "@4mica/ui";
import {
  fetchGovernance,
  financePendingKeys,
  saveGovernance,
  selectGovernance,
  selectGovernanceStatus,
  selectIsFinancePending,
} from "@stores/finance";
import { GOVERNED_ACTIONS, type GovernedAction } from "@stores/finance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  selectActiveOrganization,
  selectCan,
} from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import { fetchMembers, selectMembers } from "@stores/team";
import { Lock, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ComboBox, FieldRow, Select, TextInput } from "@/components/form";
import { SectionCard, SectionFooter } from "@/components/layout";
import { PageSpinner } from "@/components/PageSpinner";
import { SettingsPage } from "@/components/SettingsPage";
import {
  draftFromSettings,
  type GovernanceDraft,
  toSettings,
  validateGovernance,
} from "./form";

const APPROVAL_COUNTS = ["0", "1", "2", "3", "4", "5"];

function GovernanceForm() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const settings = useAppSelector(selectGovernance);
  const status = useAppSelector(selectGovernanceStatus);
  const members = useAppSelector(selectMembers);
  const canEdit = useAppSelector(selectCan(PERMISSION.GOVERNANCE_MANAGE));
  const isSaving = useAppSelector(
    selectIsFinancePending(financePendingKeys.governance),
  );
  const [draft, setDraft] = useState<GovernanceDraft | null>(null);

  useEffect(() => {
    dispatch(fetchGovernance());
    dispatch(fetchMembers());
  }, [dispatch]);

  useEffect(() => {
    if (settings) {
      setDraft(draftFromSettings(settings));
    }
  }, [settings]);

  if (status === "failed" && !settings) {
    return (
      <EmptyState
        icon={<TriangleAlert className="h-5 w-5" />}
        title={t("governance.loadFailed")}
        action={{
          label: t("finance.retry"),
          onClick: () => dispatch(fetchGovernance()),
        }}
        data-testid="governance-error"
      />
    );
  }
  if (!settings || !draft) {
    return <PageSpinner />;
  }

  const set = <K extends keyof GovernanceDraft>(
    key: K,
    value: GovernanceDraft[K],
  ) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const errors = validateGovernance(draft, t);
  const initial = draftFromSettings(settings);
  const isDirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const toggleAction = (action: GovernedAction, on: boolean) =>
    set(
      "governedActions",
      GOVERNED_ACTIONS.filter((item) =>
        item === action ? on : draft.governedActions.includes(item),
      ),
    );

  return (
    <div className="flex flex-col gap-6">
      {!canEdit && (
        <div
          className="flex items-start gap-3 rounded-lg border border-overlay/10 bg-overlay/5 px-4 py-3 text-ink-muted text-sm"
          data-testid="governance-read-only"
        >
          <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t("governance.readOnly")}</p>
        </div>
      )}

      <SectionCard
        title={t("governance.approvals.title")}
        description={t("governance.approvals.description")}
        data-testid="governance-approvals"
      >
        <FieldRow
          title={t("governance.fields.approvalsRequired")}
          description={t("governance.fields.approvalsRequiredHint")}
          htmlFor="governance-approvals-required"
        >
          <Select
            id="governance-approvals-required"
            value={draft.approvalsRequired}
            disabled={!canEdit}
            options={APPROVAL_COUNTS.map((count) => ({
              value: count,
              title:
                count === "0"
                  ? t("governance.off")
                  : t("governance.approvalCount", { count: Number(count) }),
            }))}
            onChange={(value) => set("approvalsRequired", value)}
          />
        </FieldRow>

        <fieldset
          className="flex flex-col gap-3"
          data-testid="governance-actions"
        >
          <legend className="mb-2 font-medium text-ink-strong text-sm">
            {t("governance.fields.actions")}
          </legend>
          {GOVERNED_ACTIONS.map((action) => (
            <Checkbox
              key={action}
              variant="square"
              checked={draft.governedActions.includes(action)}
              disabled={!canEdit || draft.approvalsRequired === "0"}
              onChange={(on) => toggleAction(action, on)}
              data-testid={`governance-action-${action}`}
            >
              <span className="flex flex-col">
                <span className="font-medium text-ink-strong text-sm">
                  {t(`governance.action.${action}.title`)}
                </span>
                <span className="text-ink-muted text-xs">
                  {t(`governance.action.${action}.description`)}
                </span>
              </span>
            </Checkbox>
          ))}
        </fieldset>

        <FieldRow
          title={t("governance.fields.ttl")}
          description={t("governance.fields.ttlHint")}
          htmlFor="governance-ttl"
        >
          <TextInput
            id="governance-ttl"
            inputMode="numeric"
            value={draft.approvalTtlHours}
            disabled={!canEdit}
            error={errors.approvalTtlHours}
            onChange={(value) => set("approvalTtlHours", value)}
          />
        </FieldRow>
      </SectionCard>

      <SectionCard
        title={t("governance.alerts.title")}
        description={t("governance.alerts.description")}
      >
        <FieldRow
          title={t("governance.fields.recipients")}
          description={t("governance.fields.recipientsHint")}
          htmlFor="governance-recipients"
        >
          <ComboBox
            id="governance-recipients"
            options={members.map((member) => ({
              value: member.userId,
              title: member.name || member.email || member.userId,
            }))}
            selectedValues={draft.financeRecipientIds}
            disabled={!canEdit}
            onChange={(values) =>
              set("financeRecipientIds", values.map(String))
            }
            data-testid="governance-recipients"
          />
        </FieldRow>
      </SectionCard>

      <SectionCard
        title={t("governance.audit.title")}
        description={t("governance.audit.description")}
      >
        <FieldRow
          title={t("governance.fields.retention")}
          description={t("governance.fields.retentionHint")}
          htmlFor="governance-retention"
        >
          <TextInput
            id="governance-retention"
            inputMode="numeric"
            value={draft.auditRetentionDays}
            placeholder={t("governance.keepForever")}
            disabled={!canEdit}
            error={errors.auditRetentionDays}
            onChange={(value) => set("auditRetentionDays", value)}
          />
        </FieldRow>

        {canEdit && (
          <SectionFooter>
            <Button
              type="button"
              intent="ghost"
              size="sm"
              disabled={!isDirty || isSaving}
              onClick={() => setDraft(initial)}
            >
              {t("governance.discard")}
            </Button>
            <Button
              type="button"
              intent="invert"
              size="sm"
              className="btn-no-lift min-w-20 text-sm"
              loading={isSaving}
              disabled={!isDirty || Object.keys(errors).length > 0}
              onClick={() => dispatch(saveGovernance(toSettings(draft)))}
              data-testid="governance-save"
            >
              {t("governance.save")}
            </Button>
          </SectionFooter>
        )}
      </SectionCard>
    </div>
  );
}

export function GovernanceSettings() {
  const { t } = useTranslation();
  const organization = useAppSelector(selectActiveOrganization);
  const canRead = useAppSelector(selectCan(PERMISSION.FINANCE_READ));

  return (
    <SettingsPage
      titleKey="governance.title"
      descriptionKey="governance.description"
    >
      {!canRead || organization?.personal ? (
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title={
            organization?.personal
              ? t("governance.personal.title")
              : t("finance.noAccess.title")
          }
          description={
            organization?.personal
              ? t("governance.personal.description")
              : t("finance.noAccess.description")
          }
          data-testid="governance-unavailable"
        />
      ) : (
        <GovernanceForm />
      )}
    </SettingsPage>
  );
}

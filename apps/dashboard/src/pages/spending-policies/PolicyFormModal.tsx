import { Button, Modal, Segmented } from "@4mica/ui";
import {
  clearFinanceIssues,
  financePendingKeys,
  savePolicy,
  selectFinanceError,
  selectFinanceIssues,
  selectIsFinancePending,
} from "@stores/finance";
import {
  POLICY_SCOPES,
  type PolicyMode,
  type PolicyScope,
  type SpendingPolicy,
} from "@stores/finance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  selectActiveProjectId,
  selectProjects,
} from "@stores/project/selector";
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Disclosure } from "@/components/Disclosure";
import { tokenKey, tokenLabel, tokenOptions } from "@/components/Finance/token";
import { FieldRow, Select, TextArea, TextInput } from "@/components/form";
import { useEnvironmentNetworks } from "@/hooks/useNetworkOptions";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import {
  AMOUNT_FIELDS,
  draftFrom,
  emptyDraft,
  type PolicyDraft,
  toPolicyInput,
  validatePolicy,
} from "./form";
import { useScopeTargets } from "./useScopeTargets";

const AMOUNT_PLACEHOLDERS: Record<(typeof AMOUNT_FIELDS)[number], string> = {
  perPaymentLimit: "5",
  dailyLimit: "100",
  monthlyLimit: "2000",
  approvalThreshold: "50",
};

export const SIMPLE_SCOPES: PolicyScope[] = ["ORGANIZATION", "AGENT"];

const LIMIT_FIELDS = AMOUNT_FIELDS.filter(
  (field) => field !== "approvalThreshold",
);

export const hasAdvancedValues = (draft: PolicyDraft): boolean =>
  Boolean(
    draft.approvalThreshold.trim() ||
      draft.allowedRecipients.trim() ||
      draft.approvalsRequired.trim() !== "1",
  );

export function PolicyFormModal({
  isOpen,
  simple = false,
  policy,
  onClose,
}: {
  isOpen: boolean;
  simple?: boolean;
  policy: SpendingPolicy | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const formId = useId();
  const projects = useAppSelector(selectProjects);
  const activeProjectId = useAppSelector(selectActiveProjectId);
  const networks = useEnvironmentNetworks();
  const isSaving = useAppSelector(
    selectIsFinancePending(financePendingKeys.savePolicy),
  );
  const failed = Boolean(useAppSelector(selectFinanceError));
  const issues = useAppSelector(selectFinanceIssues);

  const [draft, setDraft] = useState<PolicyDraft>(() =>
    emptyDraft(activeProjectId ?? ""),
  );
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setDraft(policy ? draftFrom(policy) : emptyDraft(activeProjectId ?? ""));
    setSubmitted(false);
    dispatch(clearFinanceIssues());
  }, [dispatch, isOpen, policy, activeProjectId]);

  useOnSuccess(isSaving, failed, onClose);

  const set = <K extends keyof PolicyDraft>(key: K, value: PolicyDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const targets = useScopeTargets(draft.scope, draft.projectId);
  const errors = validatePolicy(draft, t);
  const shown = (key: keyof PolicyDraft) =>
    (submitted ? errors[key] : undefined) ?? issues[key];

  const tokens = useMemo(() => {
    const options = tokenOptions(networks);
    const current = policy?.network
      ? tokenKey(policy.network, policy.assetAddress)
      : null;
    if (current && !options.some((option) => option.value === current)) {
      options.push({
        value: current,
        title: tokenLabel(
          policy?.network ?? null,
          policy?.assetAddress ?? null,
        ),
      });
    }
    return [{ value: "", title: t("finance.policy.anyToken") }, ...options];
  }, [networks, policy, t]);

  const withCurrent = (
    options: { value: string; title: string }[],
    current: string,
  ) =>
    current && !options.some((option) => option.value === current)
      ? [...options, { value: current, title: current }]
      : options;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || isSaving) {
      return;
    }
    dispatch(
      savePolicy({
        ...(policy ? { id: policy.id } : {}),
        data: toPolicyInput(draft),
      }),
    );
  };

  const needsProject = draft.scope !== "ORGANIZATION" && !simple;
  const hasToken = draft.token !== "";
  const scopes = simple
    ? POLICY_SCOPES.filter(
        (scope) => SIMPLE_SCOPES.includes(scope) || scope === policy?.scope,
      )
    : POLICY_SCOPES;

  const amountField = (field: (typeof AMOUNT_FIELDS)[number]) => (
    <FieldRow
      key={field}
      title={t(`finance.policy.fields.${field}`)}
      htmlFor={`policy-${field}`}
    >
      <TextInput
        id={`policy-${field}`}
        inputMode="decimal"
        value={draft[field]}
        placeholder={AMOUNT_PLACEHOLDERS[field]}
        disabled={!hasToken && !draft[field]}
        error={shown(field)}
        onChange={(value) => set(field, value)}
      />
    </FieldRow>
  );

  const approvalsField = (
    <FieldRow
      title={t("finance.policy.fields.approvalsRequired")}
      description={t("finance.policy.fields.approvalsRequiredHint")}
      htmlFor="policy-approvals"
    >
      <TextInput
        id="policy-approvals"
        inputMode="numeric"
        value={draft.approvalsRequired}
        error={shown("approvalsRequired")}
        onChange={(value) => set("approvalsRequired", value)}
      />
    </FieldRow>
  );

  const recipientsField = (
    <FieldRow
      title={t("finance.policy.fields.recipients")}
      description={t("finance.policy.fields.recipientsHint")}
      htmlFor="policy-recipients"
    >
      <TextArea
        id="policy-recipients"
        rows={3}
        spellCheck={false}
        value={draft.allowedRecipients}
        placeholder="0x…"
        error={shown("allowedRecipients")}
        onChange={(value) => set("allowedRecipients", value)}
      />
    </FieldRow>
  );

  const advancedErrors = Boolean(
    shown("approvalThreshold") ||
      shown("approvalsRequired") ||
      shown("allowedRecipients"),
  );

  return (
    <Modal
      closeLabel={t("modal.close")}
      isOpen={isOpen}
      onClose={onClose}
      title={
        policy ? t("finance.policy.editTitle") : t("finance.policy.createTitle")
      }
      description={t("finance.policy.formLead")}
      size="lg"
      data-testid="policy-form-modal"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            intent="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("confirm.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            intent="invert"
            size="sm"
            className="btn-no-lift min-w-24 text-sm"
            loading={isSaving}
            data-testid="policy-form-submit"
          >
            {policy ? t("finance.policy.save") : t("finance.policy.create")}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <FieldRow
          title={t("finance.policy.fields.name")}
          htmlFor="policy-name"
          required
        >
          <TextInput
            id="policy-name"
            value={draft.name}
            maxLength={100}
            autoFocus
            placeholder={t("finance.policy.fields.namePlaceholder")}
            error={shown("name")}
            onChange={(value) => set("name", value)}
          />
        </FieldRow>

        <FieldRow
          title={t("finance.policy.fields.mode")}
          description={t(`finance.policy.modeHint.${draft.mode}`)}
        >
          <Segmented<PolicyMode>
            label={t("finance.policy.fields.mode")}
            value={draft.mode}
            options={[
              { value: "ENFORCE", label: t("finance.mode.ENFORCE") },
              { value: "MONITOR", label: t("finance.mode.MONITOR") },
            ]}
            onChange={(value) => set("mode", value)}
            data-testid="policy-mode"
          />
        </FieldRow>

        <FieldRow
          title={t("finance.policy.fields.scope")}
          htmlFor="policy-scope"
        >
          <Select
            id="policy-scope"
            value={draft.scope}
            options={scopes.map((scope) => ({
              value: scope,
              title: t(`finance.scope.${scope}`),
            }))}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                scope: value as PolicyScope,
                agentId: "",
                apiKeyId: "",
              }))
            }
          />
        </FieldRow>

        {needsProject && (
          <FieldRow
            title={t("finance.policy.fields.project")}
            htmlFor="policy-project"
            required={draft.scope === "PROJECT"}
          >
            <Select
              id="policy-project"
              value={draft.projectId}
              options={withCurrent(
                projects.map((project) => ({
                  value: project.id,
                  title: project.name,
                })),
                draft.projectId,
              )}
              error={shown("projectId")}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  projectId: value,
                  agentId: "",
                  apiKeyId: "",
                }))
              }
            />
          </FieldRow>
        )}

        {draft.scope === "AGENT" && (
          <FieldRow
            title={t("finance.policy.fields.agent")}
            htmlFor="policy-agent"
            required
          >
            <Select
              id="policy-agent"
              value={draft.agentId}
              options={withCurrent(targets.options, draft.agentId)}
              placeholder={
                targets.loading ? t("finance.policy.loadingTargets") : undefined
              }
              error={shown("agentId")}
              hasSearch
              onChange={(value) => set("agentId", value)}
            />
          </FieldRow>
        )}

        {draft.scope === "API_KEY" && (
          <FieldRow
            title={t("finance.policy.fields.apiKey")}
            htmlFor="policy-api-key"
            required
          >
            <Select
              id="policy-api-key"
              value={draft.apiKeyId}
              options={withCurrent(targets.options, draft.apiKeyId)}
              placeholder={
                targets.loading ? t("finance.policy.loadingTargets") : undefined
              }
              error={shown("apiKeyId")}
              hasSearch
              onChange={(value) => set("apiKeyId", value)}
            />
          </FieldRow>
        )}

        <FieldRow
          title={t("finance.policy.fields.token")}
          description={t("finance.policy.fields.tokenHint")}
          htmlFor="policy-token"
        >
          <Select
            id="policy-token"
            value={draft.token}
            options={tokens}
            error={shown("token")}
            onChange={(value) => set("token", value)}
          />
        </FieldRow>

        {simple ? (
          <>
            <div className="grid gap-x-4 sm:grid-cols-3">
              {LIMIT_FIELDS.map(amountField)}
            </div>
            <Disclosure
              key={`${policy?.id ?? "new"}:${isOpen}`}
              label={t("finance.policy.advanced")}
              defaultOpen={Boolean(
                policy && hasAdvancedValues(draftFrom(policy)),
              )}
              forceOpen={advancedErrors}
              className="py-2"
              data-testid="policy-advanced"
            >
              <p className="text-ink-muted text-xs">
                {t("finance.policy.advancedHint")}
              </p>
              {policy?.approvalThreshold ? (
                <>
                  {amountField("approvalThreshold")}
                  {approvalsField}
                </>
              ) : null}
              {recipientsField}
            </Disclosure>
          </>
        ) : (
          <>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {AMOUNT_FIELDS.map(amountField)}
            </div>
            {approvalsField}
            {recipientsField}
          </>
        )}

        <FieldRow
          title={t("finance.policy.fields.alerts")}
          description={t("finance.policy.fields.alertsHint")}
          htmlFor="policy-alerts"
        >
          <TextInput
            id="policy-alerts"
            value={draft.alertThresholds}
            placeholder="50, 80, 100"
            error={shown("alertThresholds")}
            onChange={(value) => set("alertThresholds", value)}
          />
        </FieldRow>
      </form>
    </Modal>
  );
}

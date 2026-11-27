import { Button, Checkbox, EmptyState } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  fetchSecuritySettings,
  saveSecuritySettings,
  securityPendingKeys,
  selectIsSecurityPending,
  selectSecurityFailure,
  selectSecuritySettings,
  selectSecuritySettingsStatus,
} from "@stores/security";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, TextInput } from "@/components/form";
import { IpAllowlistField } from "@/components/IpAllowlistField";
import { SectionCard, SectionFooter } from "@/components/layout";
import { PageSpinner } from "@/components/PageSpinner";
import {
  draftFromSecurity,
  type PoliciesDraft,
  toSecuritySettings,
  validatePolicies,
  withEntry,
} from "./policies";

export function PoliciesSection({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const settings = useAppSelector(selectSecuritySettings);
  const status = useAppSelector(selectSecuritySettingsStatus);
  const isSaving = useAppSelector(
    selectIsSecurityPending(securityPendingKeys.settings),
  );
  const failure = useAppSelector(
    selectSecurityFailure(securityPendingKeys.settings),
  );
  const [draft, setDraft] = useState<PoliciesDraft | null>(null);

  useEffect(() => {
    if (settings) {
      setDraft(draftFromSecurity(settings));
    }
  }, [settings]);

  if (status === "failed" && !settings) {
    return (
      <EmptyState
        icon={<TriangleAlert className="h-5 w-5" />}
        title={t("security.loadFailed")}
        action={{
          label: t("security.retry"),
          onClick: () => dispatch(fetchSecuritySettings()),
        }}
        data-testid="policies-error"
      />
    );
  }
  if (!settings || !draft) {
    return <PageSpinner />;
  }

  const set = <K extends keyof PoliciesDraft>(
    key: K,
    value: PoliciesDraft[K],
  ) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  const errors = validatePolicies(draft, t);
  const initial = draftFromSecurity(settings);
  const isDirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const currentIp =
    failure?.code === "would_lock_out" && typeof failure.detail.ip === "string"
      ? failure.detail.ip
      : null;

  return (
    <SectionCard
      title={t("security.policies.title")}
      description={t("security.policies.description")}
      data-testid="security-policies"
    >
      <Checkbox
        variant="square"
        checked={draft.requireMfa}
        disabled={!canManage}
        onChange={(on) => set("requireMfa", on)}
        data-testid="policies-mfa"
      >
        <span className="flex flex-col">
          <span className="font-medium text-ink-strong text-sm">
            {t("security.policies.requireMfa")}
          </span>
          <span className="text-ink-muted text-xs">
            {t("security.policies.requireMfaHint")}
          </span>
        </span>
      </Checkbox>

      <div className="flex flex-col">
        <FieldRow
          title={t("security.policies.sessionMaxAge")}
          description={t("security.policies.sessionMaxAgeHint")}
          htmlFor="policies-session-age"
        >
          <TextInput
            id="policies-session-age"
            inputMode="numeric"
            value={draft.sessionMaxAgeHours}
            placeholder={t("security.policies.noLimit")}
            disabled={!canManage}
            error={errors.sessionMaxAgeHours}
            onChange={(value) => set("sessionMaxAgeHours", value)}
          />
        </FieldRow>

        <FieldRow
          title={t("security.policies.reauthWindow")}
          description={t("security.policies.reauthWindowHint")}
          htmlFor="policies-reauth-window"
        >
          <TextInput
            id="policies-reauth-window"
            inputMode="numeric"
            value={draft.reauthWindowMinutes}
            disabled={!canManage}
            error={errors.reauthWindowMinutes}
            onChange={(value) => set("reauthWindowMinutes", value)}
          />
        </FieldRow>

        <IpAllowlistField
          id="policies-ip-allowlist"
          title={t("security.policies.ipAllowlist")}
          description={t("security.policies.ipAllowlistHint")}
          value={draft.ipAllowlist}
          disabled={!canManage}
          onChange={(value) => set("ipAllowlist", value)}
        />

        {currentIp && (
          <div
            role="alert"
            className="mt-2 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-ink-body text-sm sm:flex-row sm:items-center sm:justify-between"
            data-testid="policies-would-lock-out"
          >
            <p>{t("security.policies.currentIp", { ip: currentIp })}</p>
            <Button
              type="button"
              size="sm"
              intent="soft"
              onClick={() =>
                set("ipAllowlist", withEntry(draft.ipAllowlist, currentIp))
              }
              data-testid="policies-add-ip"
            >
              {t("security.policies.addMyIp")}
            </Button>
          </div>
        )}
      </div>

      <Checkbox
        variant="square"
        checked={draft.enforceIpAllowlistForApiKeys}
        disabled={!canManage}
        onChange={(on) => set("enforceIpAllowlistForApiKeys", on)}
        data-testid="policies-api-keys"
      >
        <span className="flex flex-col">
          <span className="font-medium text-ink-strong text-sm">
            {t("security.policies.enforceForApiKeys")}
          </span>
          <span className="text-ink-muted text-xs">
            {t("security.policies.enforceForApiKeysHint")}
          </span>
        </span>
      </Checkbox>

      {canManage && (
        <SectionFooter>
          <Button
            type="button"
            intent="ghost"
            size="sm"
            disabled={!isDirty || isSaving}
            onClick={() => setDraft(initial)}
          >
            {t("security.discard")}
          </Button>
          <Button
            type="button"
            intent="invert"
            size="sm"
            className="btn-no-lift min-w-20 text-sm"
            loading={isSaving}
            disabled={!isDirty || Object.keys(errors).length > 0}
            onClick={() =>
              dispatch(saveSecuritySettings(toSecuritySettings(draft)))
            }
            data-testid="policies-save"
          >
            {t("security.save")}
          </Button>
        </SectionFooter>
      )}
    </SectionCard>
  );
}

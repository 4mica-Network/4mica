import type { BusinessType } from "@stores/user/type";
import { useTranslation } from "react-i18next";
import { BUSINESS_TYPES, FieldRow, Select, TextInput } from "@/components/form";

export interface BusinessDraft {
  legalName: string;
  businessType: string;
  country: string;
}

export type { BusinessType };

/**
 * Three controls, not the twenty on the Business settings page. This is a
 * blocking modal for a first-time user — the rest is collected later, and the
 * integration checklist's KYB item is what drives them back to finish it.
 */
export function BusinessStep({
  draft,
  onChange,
  issues,
}: {
  draft: BusinessDraft;
  onChange: <TKey extends keyof BusinessDraft>(
    key: TKey,
    value: BusinessDraft[TKey],
  ) => void;
  issues: Record<string, string>;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1">
      <p className="text-ink-muted text-sm">{t("onboarding.business.hint")}</p>

      <FieldRow
        title={t("onboarding.business.legalName")}
        htmlFor="onboarding-legal-name"
        description={t("onboarding.business.legalNameHint")}
      >
        <TextInput
          id="onboarding-legal-name"
          value={draft.legalName}
          onChange={(value) => onChange("legalName", value)}
          placeholder={t("onboarding.business.legalNamePlaceholder")}
          error={issues.legalName}
          maxLength={255}
        />
      </FieldRow>

      <FieldRow
        title={t("onboarding.business.type")}
        htmlFor="onboarding-business-type"
      >
        <Select
          id="onboarding-business-type"
          value={draft.businessType}
          options={BUSINESS_TYPES}
          error={issues.businessType}
          onChange={(value) => onChange("businessType", value)}
        />
      </FieldRow>

      <FieldRow
        title={t("onboarding.business.country")}
        htmlFor="onboarding-country"
        description={t("onboarding.business.countryHint")}
      >
        <TextInput
          id="onboarding-country"
          value={draft.country}
          onChange={(value) => onChange("country", value.slice(0, 2))}
          placeholder="GB"
          error={issues.country}
          format="uppercase"
          maxLength={2}
        />
      </FieldRow>
    </div>
  );
}

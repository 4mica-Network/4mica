import type { BusinessType } from "@stores/user/type";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextInput } from "@/components/form";
import { useBusinessTypeOptions } from "@/hooks/useBusinessTypeOptions";
import { useCountryOptions } from "@/hooks/useConfigOptions";

export interface BusinessDraft {
  legalName: string;
  businessType: string;
  country: string;
}

export type { BusinessType };

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
  const businessTypes = useBusinessTypeOptions();
  const countries = useCountryOptions();

  return (
    <div className="flex flex-col gap-1">
      <p className="text-ink-muted text-sm">{t("onboarding.business.hint")}</p>

      <FieldRow
        title={t("onboarding.business.legalName")}
        htmlFor="onboarding-legal-name"
        description={t("onboarding.business.legalNameHint")}
        required
      >
        <TextInput
          id="onboarding-legal-name"
          autoComplete="organization"
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
          options={businessTypes}
          error={issues.businessType}
          onChange={(value) => onChange("businessType", value)}
        />
      </FieldRow>

      <FieldRow
        title={t("onboarding.business.country")}
        htmlFor="onboarding-country"
        description={t("onboarding.business.countryHint")}
      >
        <Select
          id="onboarding-country"
          value={draft.country}
          options={countries}
          error={issues.country}
          hasSearch
          onChange={(value) => onChange("country", value)}
        />
      </FieldRow>
    </div>
  );
}

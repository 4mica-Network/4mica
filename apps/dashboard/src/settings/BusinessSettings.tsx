import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateBusiness } from "@stores/user/actions";
import {
  selectBusiness,
  selectIsBusinessUpdating,
  selectValidationIssues,
} from "@stores/user/selector";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Field,
  FormSection,
  Select,
  TextArea,
  TextInput,
  VerifiedBadge,
} from "@/components/form";
import { SettingsForm } from "./SettingsForm";
import { useSettingsForm } from "./useSettingsForm";

const BUSINESS_TYPES = [
  { label: "—", value: "" },
  { label: "Sole trader", value: "SOLE_TRADER" },
  { label: "Partnership", value: "PARTNERSHIP" },
  { label: "LLC", value: "LLC" },
  { label: "Corporation", value: "CORPORATION" },
  { label: "Non-profit", value: "NON_PROFIT" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD"].map(
  (code) => ({ label: code, value: code }),
);

export function BusinessSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const business = useAppSelector(selectBusiness);
  const isSaving = useAppSelector(selectIsBusinessUpdating);
  const issues = useAppSelector(selectValidationIssues);

  const initial = useMemo(
    () => ({
      legalName: business?.legalName ?? "",
      tradingName: business?.tradingName ?? "",
      businessType: business?.businessType ?? "",
      registrationNumber: business?.registrationNumber ?? "",
      taxId: business?.taxId ?? "",
      vatNumber: business?.vatNumber ?? "",
      industry: business?.industry ?? "",
      website: business?.website ?? "",
      description: business?.description ?? "",
      supportEmail: business?.supportEmail ?? "",
      supportPhone: business?.supportPhone ?? "",
      addressLine1: business?.addressLine1 ?? "",
      addressLine2: business?.addressLine2 ?? "",
      city: business?.city ?? "",
      region: business?.region ?? "",
      postalCode: business?.postalCode ?? "",
      country: business?.country ?? "",
      statementDescriptor: business?.statementDescriptor ?? "",
      payoutCurrency: business?.payoutCurrency ?? "USD",
    }),
    [business],
  );

  const { draft, set, isDirty, changes, reset } = useSettingsForm(initial);

  const submit = () => {
    // The API treats null as "clear this field"; empty strings from text
    // inputs must be converted or valibot rejects them as too-short.
    const payload = Object.fromEntries(
      Object.entries(changes).map(([key, value]) => [
        key,
        value === "" && key !== "legalName" && key !== "payoutCurrency"
          ? null
          : value,
      ]),
    );
    dispatch(updateBusiness(payload));
  };

  if (!draft) {
    return null;
  }

  return (
    <SettingsForm
      titleKey="page.settings.business.title"
      descriptionKey="page.settings.business.description"
      isDirty={isDirty}
      isSaving={isSaving}
      onSubmit={submit}
      onReset={reset}
    >
      <FormSection
        title={t("settings.business.entity")}
        description={t("settings.business.entityHint")}
      >
        <div className="flex items-center gap-2">
          <span className="text-ink-muted text-sm">
            {t("settings.business.kyb")}
          </span>
          <VerifiedBadge verified={business?.kybStatus === "VERIFIED"} />
        </div>

        <Field
          label={t("settings.business.legalName")}
          htmlFor="business-legal-name"
          error={issues.legalName}
        >
          <TextInput
            id="business-legal-name"
            value={draft.legalName}
            invalid={Boolean(issues.legalName)}
            onChange={(v) => set("legalName", v)}
          />
        </Field>

        <Field
          label={t("settings.business.tradingName")}
          htmlFor="business-trading-name"
          error={issues.tradingName}
        >
          <TextInput
            id="business-trading-name"
            value={draft.tradingName}
            onChange={(v) => set("tradingName", v)}
          />
        </Field>

        <Field
          label={t("settings.business.type")}
          htmlFor="business-type"
          error={issues.businessType}
        >
          <Select
            id="business-type"
            value={draft.businessType}
            options={BUSINESS_TYPES}
            onChange={(v) => set("businessType", v)}
          />
        </Field>

        <Field
          label={t("settings.business.industry")}
          htmlFor="business-industry"
        >
          <TextInput
            id="business-industry"
            value={draft.industry}
            onChange={(v) => set("industry", v)}
          />
        </Field>

        <Field
          label={t("settings.business.description")}
          htmlFor="business-description"
        >
          <TextArea
            id="business-description"
            rows={3}
            value={draft.description}
            onChange={(v) => set("description", v)}
          />
        </Field>
      </FormSection>

      <FormSection
        title={t("settings.business.registration")}
        description={t("settings.business.registrationHint")}
      >
        <Field
          label={t("settings.business.registrationNumber")}
          htmlFor="business-reg-no"
          error={issues.registrationNumber}
        >
          <TextInput
            id="business-reg-no"
            value={draft.registrationNumber}
            onChange={(v) => set("registrationNumber", v)}
          />
        </Field>
        <Field
          label={t("settings.business.taxId")}
          htmlFor="business-tax-id"
          error={issues.taxId}
        >
          <TextInput
            id="business-tax-id"
            value={draft.taxId}
            onChange={(v) => set("taxId", v)}
          />
        </Field>
        <Field
          label={t("settings.business.vatNumber")}
          htmlFor="business-vat"
          error={issues.vatNumber}
        >
          <TextInput
            id="business-vat"
            value={draft.vatNumber}
            onChange={(v) => set("vatNumber", v)}
          />
        </Field>
      </FormSection>

      <FormSection title={t("settings.business.contact")}>
        <Field
          label={t("settings.business.website")}
          htmlFor="business-website"
          error={issues.website}
        >
          <TextInput
            id="business-website"
            value={draft.website}
            placeholder="https://example.com"
            invalid={Boolean(issues.website)}
            onChange={(v) => set("website", v)}
          />
        </Field>
        <Field
          label={t("settings.business.supportEmail")}
          htmlFor="business-support-email"
          error={issues.supportEmail}
        >
          <TextInput
            id="business-support-email"
            type="email"
            value={draft.supportEmail}
            invalid={Boolean(issues.supportEmail)}
            onChange={(v) => set("supportEmail", v)}
          />
        </Field>
        <Field
          label={t("settings.business.supportPhone")}
          htmlFor="business-support-phone"
          error={issues.supportPhone}
        >
          <TextInput
            id="business-support-phone"
            value={draft.supportPhone}
            onChange={(v) => set("supportPhone", v)}
          />
        </Field>
      </FormSection>

      <FormSection title={t("settings.business.address")}>
        <Field
          label={t("settings.business.addressLine1")}
          htmlFor="business-address1"
        >
          <TextInput
            id="business-address1"
            value={draft.addressLine1}
            onChange={(v) => set("addressLine1", v)}
          />
        </Field>
        <Field
          label={t("settings.business.addressLine2")}
          htmlFor="business-address2"
        >
          <TextInput
            id="business-address2"
            value={draft.addressLine2}
            onChange={(v) => set("addressLine2", v)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("settings.business.city")} htmlFor="business-city">
            <TextInput
              id="business-city"
              value={draft.city}
              onChange={(v) => set("city", v)}
            />
          </Field>
          <Field
            label={t("settings.business.region")}
            htmlFor="business-region"
          >
            <TextInput
              id="business-region"
              value={draft.region}
              onChange={(v) => set("region", v)}
            />
          </Field>
          <Field
            label={t("settings.business.postalCode")}
            htmlFor="business-postal"
          >
            <TextInput
              id="business-postal"
              value={draft.postalCode}
              onChange={(v) => set("postalCode", v)}
            />
          </Field>
          <Field
            label={t("settings.business.country")}
            htmlFor="business-country"
            hint={t("settings.business.countryHint")}
            error={issues.country}
          >
            <TextInput
              id="business-country"
              value={draft.country}
              placeholder="US"
              invalid={Boolean(issues.country)}
              onChange={(v) => set("country", v.toUpperCase().slice(0, 2))}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title={t("settings.business.payouts")}
        description={t("settings.business.payoutsHint")}
      >
        <Field
          label={t("settings.business.payoutCurrency")}
          htmlFor="business-currency"
          error={issues.payoutCurrency}
        >
          <Select
            id="business-currency"
            value={draft.payoutCurrency}
            options={CURRENCIES}
            onChange={(v) => set("payoutCurrency", v)}
          />
        </Field>
        <Field
          label={t("settings.business.statementDescriptor")}
          htmlFor="business-descriptor"
          hint={t("settings.business.statementDescriptorHint")}
          error={issues.statementDescriptor}
        >
          <TextInput
            id="business-descriptor"
            value={draft.statementDescriptor}
            invalid={Boolean(issues.statementDescriptor)}
            onChange={(v) => set("statementDescriptor", v.slice(0, 22))}
          />
        </Field>
      </FormSection>
    </SettingsForm>
  );
}

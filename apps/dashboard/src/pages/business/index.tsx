import { isPhoneNumber, isWebUrl } from "@4mica/rules";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateBusiness } from "@stores/user/actions";
import {
  selectBusiness,
  selectIsSectionSaving,
  selectValidationIssues,
} from "@stores/user/selector";
import type { BusinessType } from "@stores/user/type";
import { blankFieldsToNull } from "@utils/format";
import { hasErrors, isEmail } from "@utils/validation";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { KybTag } from "@/components/badges";
import { EditableCard, InstantCard } from "@/components/EditableCard";
import {
  FieldRow,
  Select,
  SettingRow,
  TextArea,
  TextInput,
} from "@/components/form";
import { SettingsSection, SurfaceCard } from "@/components/layout";
import { SettingsPage } from "@/components/SettingsPage";
import { useBusinessTypeOptions } from "@/hooks/useBusinessTypeOptions";
import { useDraft } from "@/hooks/useDraft";

type FieldKind = "required" | "url" | "email" | "phone" | "country";

const FIELD_RULES: Record<string, { max: number; kind?: FieldKind }> = {
  legalName: { max: 255, kind: "required" },
  tradingName: { max: 255 },
  industry: { max: 128 },
  description: { max: 2000 },
  registrationNumber: { max: 64 },
  taxId: { max: 64 },
  vatNumber: { max: 64 },
  website: { max: 255, kind: "url" },
  supportEmail: { max: 255, kind: "email" },
  supportPhone: { max: 20, kind: "phone" },
  addressLine1: { max: 255 },
  addressLine2: { max: 255 },
  city: { max: 128 },
  region: { max: 128 },
  postalCode: { max: 32 },
  country: { max: 2, kind: "country" },
  statementDescriptor: { max: 22 },
};

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD"].map(
  (code) => ({ title: code, value: code }),
);

export function BusinessSettings() {
  const { t } = useTranslation();
  const businessTypes = useBusinessTypeOptions();
  const dispatch = useAppDispatch();
  const business = useAppSelector(selectBusiness);
  const issues = useAppSelector(selectValidationIssues);
  const savingEntity = useAppSelector(selectIsSectionSaving("entity"));
  const savingType = useAppSelector(selectIsSectionSaving("businessType"));
  const savingRegistration = useAppSelector(
    selectIsSectionSaving("registration"),
  );
  const savingContact = useAppSelector(selectIsSectionSaving("contact"));
  const savingAddress = useAppSelector(selectIsSectionSaving("address"));
  const savingCurrency = useAppSelector(
    selectIsSectionSaving("payoutCurrency"),
  );
  const savingDescriptor = useAppSelector(selectIsSectionSaving("descriptor"));

  const entityInitial = useMemo(
    () => ({
      legalName: business?.legalName ?? "",
      tradingName: business?.tradingName ?? "",
      industry: business?.industry ?? "",
      description: business?.description ?? "",
    }),
    [business],
  );

  const registrationInitial = useMemo(
    () => ({
      registrationNumber: business?.registrationNumber ?? "",
      taxId: business?.taxId ?? "",
      vatNumber: business?.vatNumber ?? "",
    }),
    [business],
  );

  const contactInitial = useMemo(
    () => ({
      website: business?.website ?? "",
      supportEmail: business?.supportEmail ?? "",
      supportPhone: business?.supportPhone ?? "",
    }),
    [business],
  );

  const addressInitial = useMemo(
    () => ({
      addressLine1: business?.addressLine1 ?? "",
      addressLine2: business?.addressLine2 ?? "",
      city: business?.city ?? "",
      region: business?.region ?? "",
      postalCode: business?.postalCode ?? "",
      country: business?.country ?? "",
    }),
    [business],
  );

  const descriptorInitial = useMemo(
    () => ({ statementDescriptor: business?.statementDescriptor ?? "" }),
    [business],
  );

  const entity = useDraft(entityInitial);
  const registration = useDraft(registrationInitial);
  const contact = useDraft(contactInitial);
  const address = useDraft(addressInitial);
  const descriptor = useDraft(descriptorInitial);

  const validate = (key: string, raw: string): string | undefined => {
    const rule = FIELD_RULES[key];
    const value = raw.trim();
    if (!rule) {
      return undefined;
    }
    if (value === "") {
      return rule.kind === "required" ? t("validation.required") : undefined;
    }
    if (value.length > rule.max) {
      return t("validation.tooLong", { max: rule.max });
    }
    switch (rule.kind) {
      case "url":
        return isWebUrl(value) ? undefined : t("validation.webUrl");
      case "email":
        return isEmail(value) ? undefined : t("validation.email");
      case "phone":
        return isPhoneNumber(value) ? undefined : t("validation.phone");
      case "country":
        return /^[A-Za-z]{2}$/.test(value)
          ? undefined
          : t("validation.countryCode");
      default:
        return undefined;
    }
  };

  const errorsOf = (draft: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, validate(key, value)]),
    ) as Record<string, string | undefined>;

  const entityErrors = errorsOf(entity.draft);
  const registrationErrors = errorsOf(registration.draft);
  const contactErrors = errorsOf(contact.draft);
  const addressErrors = errorsOf(address.draft);
  const descriptorErrors = errorsOf(descriptor.draft);
  const fieldErrors: Record<string, string | undefined> = {
    ...entityErrors,
    ...registrationErrors,
    ...contactErrors,
    ...addressErrors,
    ...descriptorErrors,
  };

  const save = (
    changes: Record<string, unknown>,
    section: string,
    keep: string[] = [],
  ) => dispatch(updateBusiness(blankFieldsToNull(changes, keep), section));

  return (
    <SettingsPage
      titleKey="page.settings.business.title"
      descriptionKey="page.settings.business.description"
    >
      <SettingsSection
        title={t("settings.business.entity")}
        description={t("settings.business.entityHint")}
      >
        <SurfaceCard className="flex items-center justify-between gap-4">
          <div>
            <span className="font-medium text-ink-strong text-sm">
              {t("settings.business.kyb")}
            </span>
            <p className="mt-0.5 text-ink-muted text-xs">
              {t("settings.business.kybHint")}
            </p>
          </div>
          <KybTag
            status={business?.kybStatus ?? "UNVERIFIED"}
            label={t(`settings.kyb.${business?.kybStatus ?? "UNVERIFIED"}`)}
          />
        </SurfaceCard>

        <EditableCard
          isDirty={entity.isDirty}
          isInvalid={hasErrors(entityErrors)}
          isSaving={savingEntity}
          onSave={() => save(entity.changes, "entity", ["legalName"])}
          onReset={entity.reset}
        >
          <FieldRow
            title={t("settings.business.legalName")}
            description={t("settings.business.legalNameHint")}
            htmlFor="business-legal-name"
          >
            <TextInput
              id="business-legal-name"
              autoComplete="organization"
              required
              value={entity.draft.legalName}
              error={fieldErrors.legalName ?? issues.legalName}
              maxLength={255}
              onChange={(v) => entity.set("legalName", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.tradingName")}
            description={t("settings.business.tradingNameHint")}
            htmlFor="business-trading-name"
          >
            <TextInput
              id="business-trading-name"
              autoComplete="organization"
              value={entity.draft.tradingName}
              error={fieldErrors.tradingName ?? issues.tradingName}
              maxLength={255}
              onChange={(v) => entity.set("tradingName", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.industry")}
            description={t("settings.business.industryHint")}
            htmlFor="business-industry"
          >
            <TextInput
              id="business-industry"
              value={entity.draft.industry}
              error={fieldErrors.industry ?? issues.industry}
              maxLength={128}
              onChange={(v) => entity.set("industry", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.description")}
            description={t("settings.business.descriptionHint")}
            htmlFor="business-description"
          >
            <TextArea
              id="business-description"
              value={entity.draft.description}
              error={fieldErrors.description ?? issues.description}
              maxLength={2000}
              onChange={(v) => entity.set("description", v)}
            />
          </FieldRow>
        </EditableCard>

        <InstantCard isSaving={savingType}>
          <SettingRow
            title={t("settings.business.type")}
            description={t("settings.business.typeHint")}
            htmlFor="business-type"
            error={issues.businessType}
          >
            <Select
              id="business-type"
              value={business?.businessType ?? ""}
              options={businessTypes}
              onChange={(v) =>
                dispatch(
                  updateBusiness(
                    { businessType: (v || null) as BusinessType | null },
                    "businessType",
                  ),
                )
              }
            />
          </SettingRow>
        </InstantCard>
      </SettingsSection>

      <SettingsSection
        title={t("settings.business.registration")}
        description={t("settings.business.registrationHint")}
      >
        <EditableCard
          isDirty={registration.isDirty}
          isInvalid={hasErrors(registrationErrors)}
          isSaving={savingRegistration}
          onSave={() => save(registration.changes, "registration")}
          onReset={registration.reset}
        >
          <FieldRow
            title={t("settings.business.registrationNumber")}
            description={t("settings.business.registrationNumberHint")}
            htmlFor="business-reg-no"
          >
            <TextInput
              id="business-reg-no"
              value={registration.draft.registrationNumber}
              error={
                fieldErrors.registrationNumber ?? issues.registrationNumber
              }
              maxLength={64}
              onChange={(v) => registration.set("registrationNumber", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.taxId")}
            description={t("settings.business.taxIdHint")}
            htmlFor="business-tax-id"
          >
            <TextInput
              id="business-tax-id"
              value={registration.draft.taxId}
              error={fieldErrors.taxId ?? issues.taxId}
              maxLength={64}
              onChange={(v) => registration.set("taxId", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.vatNumber")}
            description={t("settings.business.vatNumberHint")}
            htmlFor="business-vat"
          >
            <TextInput
              id="business-vat"
              value={registration.draft.vatNumber}
              error={fieldErrors.vatNumber ?? issues.vatNumber}
              maxLength={64}
              onChange={(v) => registration.set("vatNumber", v)}
            />
          </FieldRow>
        </EditableCard>
      </SettingsSection>

      <SettingsSection
        title={t("settings.business.contact")}
        description={t("settings.business.contactHint")}
      >
        <EditableCard
          isDirty={contact.isDirty}
          isInvalid={hasErrors(contactErrors)}
          isSaving={savingContact}
          onSave={() => save(contact.changes, "contact")}
          onReset={contact.reset}
        >
          <FieldRow
            title={t("settings.business.website")}
            description={t("settings.business.websiteHint")}
            htmlFor="business-website"
          >
            <TextInput
              id="business-website"
              type="url"
              inputMode="url"
              autoComplete="url"
              value={contact.draft.website}
              error={fieldErrors.website ?? issues.website}
              maxLength={255}
              placeholder="https://example.com"
              onChange={(v) => contact.set("website", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.supportEmail")}
            description={t("settings.business.supportEmailHint")}
            htmlFor="business-support-email"
          >
            <TextInput
              id="business-support-email"
              inputMode="email"
              autoComplete="email"
              type="email"
              value={contact.draft.supportEmail}
              error={fieldErrors.supportEmail ?? issues.supportEmail}
              maxLength={255}
              onChange={(v) => contact.set("supportEmail", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.supportPhone")}
            description={t("settings.business.supportPhoneHint")}
            htmlFor="business-support-phone"
          >
            <TextInput
              id="business-support-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={contact.draft.supportPhone}
              error={fieldErrors.supportPhone ?? issues.supportPhone}
              maxLength={20}
              onChange={(v) => contact.set("supportPhone", v)}
            />
          </FieldRow>
        </EditableCard>
      </SettingsSection>

      <SettingsSection
        title={t("settings.business.address")}
        description={t("settings.business.addressHint")}
      >
        <EditableCard
          isDirty={address.isDirty}
          isInvalid={hasErrors(addressErrors)}
          isSaving={savingAddress}
          onSave={() => save(address.changes, "address")}
          onReset={address.reset}
        >
          <FieldRow
            title={t("settings.business.addressLine1")}
            description={t("settings.business.addressLine1Hint")}
            htmlFor="business-address1"
          >
            <TextInput
              id="business-address1"
              autoComplete="address-line1"
              value={address.draft.addressLine1}
              error={fieldErrors.addressLine1 ?? issues.addressLine1}
              maxLength={255}
              onChange={(v) => address.set("addressLine1", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.addressLine2")}
            description={t("settings.business.addressLine2Hint")}
            htmlFor="business-address2"
          >
            <TextInput
              id="business-address2"
              autoComplete="address-line2"
              value={address.draft.addressLine2}
              error={fieldErrors.addressLine2 ?? issues.addressLine2}
              maxLength={255}
              onChange={(v) => address.set("addressLine2", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.city")}
            description={t("settings.business.cityHint")}
            htmlFor="business-city"
          >
            <TextInput
              id="business-city"
              autoComplete="address-level2"
              value={address.draft.city}
              error={fieldErrors.city ?? issues.city}
              maxLength={128}
              onChange={(v) => address.set("city", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.region")}
            description={t("settings.business.regionHint")}
            htmlFor="business-region"
          >
            <TextInput
              id="business-region"
              autoComplete="address-level1"
              value={address.draft.region}
              error={fieldErrors.region ?? issues.region}
              maxLength={128}
              onChange={(v) => address.set("region", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.postalCode")}
            description={t("settings.business.postalCodeHint")}
            htmlFor="business-postal"
          >
            <TextInput
              id="business-postal"
              autoComplete="postal-code"
              value={address.draft.postalCode}
              error={fieldErrors.postalCode ?? issues.postalCode}
              maxLength={32}
              onChange={(v) => address.set("postalCode", v)}
            />
          </FieldRow>
          <FieldRow
            title={t("settings.business.country")}
            description={t("settings.business.countryHint")}
            htmlFor="business-country"
          >
            <TextInput
              id="business-country"
              autoComplete="country"
              value={address.draft.country}
              error={fieldErrors.country ?? issues.country}
              maxLength={2}
              placeholder="US"
              format="uppercase"
              onChange={(v) => address.set("country", v.slice(0, 2))}
            />
          </FieldRow>
        </EditableCard>
      </SettingsSection>

      <SettingsSection
        title={t("settings.business.payouts")}
        description={t("settings.business.payoutsHint")}
      >
        <InstantCard isSaving={savingCurrency}>
          <SettingRow
            title={t("settings.business.payoutCurrency")}
            description={t("settings.business.payoutCurrencyHint")}
            htmlFor="business-currency"
            error={issues.payoutCurrency}
          >
            <Select
              id="business-currency"
              value={business?.payoutCurrency ?? "USD"}
              options={CURRENCIES}
              hasSearch
              onChange={(v) =>
                dispatch(
                  updateBusiness({ payoutCurrency: v }, "payoutCurrency"),
                )
              }
            />
          </SettingRow>
        </InstantCard>

        <EditableCard
          isDirty={descriptor.isDirty}
          isInvalid={hasErrors(descriptorErrors)}
          isSaving={savingDescriptor}
          onSave={() => save(descriptor.changes, "descriptor")}
          onReset={descriptor.reset}
        >
          <FieldRow
            title={t("settings.business.statementDescriptor")}
            description={t("settings.business.statementDescriptorHint")}
            htmlFor="business-descriptor"
          >
            <TextInput
              id="business-descriptor"
              value={descriptor.draft.statementDescriptor}
              error={
                fieldErrors.statementDescriptor ?? issues.statementDescriptor
              }
              maxLength={22}
              onChange={(v) =>
                descriptor.set("statementDescriptor", v.slice(0, 22))
              }
            />
          </FieldRow>
        </EditableCard>
      </SettingsSection>
    </SettingsPage>
  );
}

import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateBusiness } from "@stores/user/actions";
import {
  selectBusiness,
  selectIsSectionSaving,
  selectValidationIssues,
} from "@stores/user/selector";
import type { BusinessType } from "@stores/user/type";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  FieldRow,
  Select,
  SettingRow,
  SettingsSection,
  TextArea,
  TextInput,
  VerifiedBadge,
} from "@/components/form";
import { EditableCard, InstantCard } from "./EditableCard";
import { SettingsPage } from "./SettingsPage";
import { useDraft } from "./useDraft";

const BUSINESS_TYPES = [
  { title: "—", value: "" },
  { title: "Sole trader", value: "SOLE_TRADER" },
  { title: "Partnership", value: "PARTNERSHIP" },
  { title: "LLC", value: "LLC" },
  { title: "Corporation", value: "CORPORATION" },
  { title: "Non-profit", value: "NON_PROFIT" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD"].map(
  (code) => ({ title: code, value: code }),
);

/** Empty strings mean "clear this optional field"; the API expects null. */
const blankToNull = (changes: Record<string, unknown>, keep: string[] = []) =>
  Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [
      key,
      value === "" && !keep.includes(key) ? null : value,
    ]),
  );

export function BusinessSettings() {
  const { t } = useTranslation();
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

  const save = (
    changes: Record<string, unknown>,
    section: string,
    keep: string[] = [],
  ) => dispatch(updateBusiness(blankToNull(changes, keep), section));

  return (
    <SettingsPage
      titleKey="page.settings.business.title"
      descriptionKey="page.settings.business.description"
    >
      <SettingsSection
        title={t("settings.business.entity")}
        description={t("settings.business.entityHint")}
      >
        <Card className="flex items-center justify-between gap-4">
          <div>
            <span className="font-medium text-ink-strong text-sm">
              {t("settings.business.kyb")}
            </span>
            <p className="mt-0.5 text-ink-muted text-xs">
              {t("settings.business.kybHint")}
            </p>
          </div>
          <VerifiedBadge
            verified={business?.kybStatus === "VERIFIED"}
            labels={{
              yes: t("settings.verified"),
              no: t("settings.unverified"),
            }}
          />
        </Card>

        <EditableCard
          isDirty={entity.isDirty}
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
              value={entity.draft.legalName}
              error={issues.legalName}
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
              value={entity.draft.tradingName}
              error={issues.tradingName}
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
              options={BUSINESS_TYPES}
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
              error={issues.registrationNumber}
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
              error={issues.taxId}
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
              error={issues.vatNumber}
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
              value={contact.draft.website}
              placeholder="https://example.com"
              error={issues.website}
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
              type="email"
              value={contact.draft.supportEmail}
              error={issues.supportEmail}
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
              value={contact.draft.supportPhone}
              error={issues.supportPhone}
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
              value={address.draft.addressLine1}
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
              value={address.draft.addressLine2}
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
              value={address.draft.city}
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
              value={address.draft.region}
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
              value={address.draft.postalCode}
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
              value={address.draft.country}
              placeholder="US"
              format="uppercase"
              maxLength={2}
              error={issues.country}
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
              maxLength={22}
              error={issues.statementDescriptor}
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

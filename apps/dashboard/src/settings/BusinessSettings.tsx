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
  Select,
  SettingRow,
  TextArea,
  TextInput,
  VerifiedBadge,
} from "@/components/form";
import { EditableCard, InstantCard } from "./EditableCard";
import { SettingsPage } from "./SettingsPage";
import { useDraft } from "./useDraft";

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
  const savingRegistration = useAppSelector(
    selectIsSectionSaving("registration"),
  );
  const savingContact = useAppSelector(selectIsSectionSaving("contact"));
  const savingAddress = useAppSelector(selectIsSectionSaving("address"));
  const savingPayouts = useAppSelector(selectIsSectionSaving("payouts"));

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
      <Card className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-ink-strong text-sm">
            {t("settings.business.kyb")}
          </h3>
          <p className="mt-0.5 text-ink-muted text-xs">
            {t("settings.business.kybHint")}
          </p>
        </div>
        <VerifiedBadge
          verified={business?.kybStatus === "VERIFIED"}
          labels={{ yes: t("settings.verified"), no: t("settings.unverified") }}
        />
      </Card>

      <EditableCard
        title={t("settings.business.entity")}
        description={t("settings.business.entityHint")}
        isDirty={entity.isDirty}
        isSaving={savingEntity}
        onSave={() => save(entity.changes, "entity", ["legalName"])}
        onReset={entity.reset}
      >
        <SettingRow
          title={t("settings.business.legalName")}
          htmlFor="business-legal-name"
          error={issues.legalName}
        >
          <TextInput
            id="business-legal-name"
            value={entity.draft.legalName}
            invalid={Boolean(issues.legalName)}
            onChange={(v) => entity.set("legalName", v)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.business.tradingName")}
          htmlFor="business-trading-name"
          error={issues.tradingName}
        >
          <TextInput
            id="business-trading-name"
            value={entity.draft.tradingName}
            onChange={(v) => entity.set("tradingName", v)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.business.industry")}
          htmlFor="business-industry"
        >
          <TextInput
            id="business-industry"
            value={entity.draft.industry}
            onChange={(v) => entity.set("industry", v)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.business.description")}
          htmlFor="business-description"
        >
          <TextArea
            id="business-description"
            value={entity.draft.description}
            onChange={(v) => entity.set("description", v)}
          />
        </SettingRow>
      </EditableCard>

      <InstantCard
        title={t("settings.business.type")}
        description={t("settings.business.typeHint")}
        isSaving={savingEntity}
      >
        <SettingRow
          title={t("settings.business.type")}
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
                  "entity",
                ),
              )
            }
          />
        </SettingRow>
      </InstantCard>

      <EditableCard
        title={t("settings.business.registration")}
        description={t("settings.business.registrationHint")}
        isDirty={registration.isDirty}
        isSaving={savingRegistration}
        onSave={() => save(registration.changes, "registration")}
        onReset={registration.reset}
      >
        <SettingRow
          title={t("settings.business.registrationNumber")}
          htmlFor="business-reg-no"
          error={issues.registrationNumber}
        >
          <TextInput
            id="business-reg-no"
            value={registration.draft.registrationNumber}
            onChange={(v) => registration.set("registrationNumber", v)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.business.taxId")}
          htmlFor="business-tax-id"
          error={issues.taxId}
        >
          <TextInput
            id="business-tax-id"
            value={registration.draft.taxId}
            onChange={(v) => registration.set("taxId", v)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.business.vatNumber")}
          htmlFor="business-vat"
          error={issues.vatNumber}
        >
          <TextInput
            id="business-vat"
            value={registration.draft.vatNumber}
            onChange={(v) => registration.set("vatNumber", v)}
          />
        </SettingRow>
      </EditableCard>

      <EditableCard
        title={t("settings.business.contact")}
        description={t("settings.business.contactHint")}
        isDirty={contact.isDirty}
        isSaving={savingContact}
        onSave={() => save(contact.changes, "contact")}
        onReset={contact.reset}
      >
        <SettingRow
          title={t("settings.business.website")}
          htmlFor="business-website"
          error={issues.website}
        >
          <TextInput
            id="business-website"
            value={contact.draft.website}
            placeholder="https://example.com"
            invalid={Boolean(issues.website)}
            onChange={(v) => contact.set("website", v)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.business.supportEmail")}
          htmlFor="business-support-email"
          error={issues.supportEmail}
        >
          <TextInput
            id="business-support-email"
            type="email"
            value={contact.draft.supportEmail}
            invalid={Boolean(issues.supportEmail)}
            onChange={(v) => contact.set("supportEmail", v)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.business.supportPhone")}
          htmlFor="business-support-phone"
          error={issues.supportPhone}
        >
          <TextInput
            id="business-support-phone"
            value={contact.draft.supportPhone}
            onChange={(v) => contact.set("supportPhone", v)}
          />
        </SettingRow>
      </EditableCard>

      <EditableCard
        title={t("settings.business.address")}
        description={t("settings.business.addressHint")}
        isDirty={address.isDirty}
        isSaving={savingAddress}
        onSave={() => save(address.changes, "address")}
        onReset={address.reset}
      >
        <SettingRow
          title={t("settings.business.addressLine1")}
          htmlFor="business-address1"
        >
          <TextInput
            id="business-address1"
            value={address.draft.addressLine1}
            onChange={(v) => address.set("addressLine1", v)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.business.addressLine2")}
          htmlFor="business-address2"
        >
          <TextInput
            id="business-address2"
            value={address.draft.addressLine2}
            onChange={(v) => address.set("addressLine2", v)}
          />
        </SettingRow>
        <SettingRow title={t("settings.business.city")} htmlFor="business-city">
          <TextInput
            id="business-city"
            value={address.draft.city}
            onChange={(v) => address.set("city", v)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.business.region")}
          htmlFor="business-region"
        >
          <TextInput
            id="business-region"
            value={address.draft.region}
            onChange={(v) => address.set("region", v)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.business.postalCode")}
          htmlFor="business-postal"
        >
          <TextInput
            id="business-postal"
            value={address.draft.postalCode}
            onChange={(v) => address.set("postalCode", v)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.business.country")}
          description={t("settings.business.countryHint")}
          htmlFor="business-country"
          error={issues.country}
        >
          <TextInput
            id="business-country"
            value={address.draft.country}
            placeholder="US"
            invalid={Boolean(issues.country)}
            onChange={(v) =>
              address.set("country", v.toUpperCase().slice(0, 2))
            }
          />
        </SettingRow>
      </EditableCard>

      <InstantCard
        title={t("settings.business.payouts")}
        description={t("settings.business.payoutsHint")}
        isSaving={savingPayouts}
      >
        <SettingRow
          title={t("settings.business.payoutCurrency")}
          htmlFor="business-currency"
          error={issues.payoutCurrency}
        >
          <Select
            id="business-currency"
            value={business?.payoutCurrency ?? "USD"}
            options={CURRENCIES}
            onChange={(v) =>
              dispatch(updateBusiness({ payoutCurrency: v }, "payouts"))
            }
          />
        </SettingRow>
      </InstantCard>

      <EditableCard
        title={t("settings.business.statementDescriptor")}
        description={t("settings.business.statementDescriptorHint")}
        isDirty={descriptor.isDirty}
        isSaving={savingPayouts}
        onSave={() => save(descriptor.changes, "payouts")}
        onReset={descriptor.reset}
      >
        <SettingRow
          title={t("settings.business.statementDescriptor")}
          htmlFor="business-descriptor"
          error={issues.statementDescriptor}
        >
          <TextInput
            id="business-descriptor"
            value={descriptor.draft.statementDescriptor}
            invalid={Boolean(issues.statementDescriptor)}
            onChange={(v) =>
              descriptor.set("statementDescriptor", v.slice(0, 22))
            }
          />
        </SettingRow>
      </EditableCard>
    </SettingsPage>
  );
}

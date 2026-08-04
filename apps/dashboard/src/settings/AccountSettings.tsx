import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateAccount } from "@stores/user/actions";
import {
  selectIsSectionSaving,
  selectUser,
  selectValidationIssues,
} from "@stores/user/selector";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FieldRow,
  Select,
  SettingRow,
  SettingsSection,
  SwitchCard,
  TextInput,
  VerifiedBadge,
} from "@/components/form";
import { EditableCard, InstantCard } from "./EditableCard";
import { SettingsPage } from "./SettingsPage";
import { useDraft } from "./useDraft";

const THEMES = [
  { label: "Dark", value: "dark" },
  { label: "Light", value: "light" },
  { label: "System", value: "system" },
];

const LANGUAGES = [
  { label: "English", value: "en" },
  { label: "Deutsch", value: "de" },
  { label: "Français", value: "fr" },
  { label: "Español", value: "es" },
];

const HOMES = [
  { label: "Overview", value: "overview" },
  { label: "Balances", value: "balances" },
  { label: "Transactions", value: "transactions" },
  { label: "Payments", value: "payments" },
  { label: "Agents", value: "agents" },
];

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
].map((zone) => ({ label: zone, value: zone }));

export function AccountSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const issues = useAppSelector(selectValidationIssues);
  const savingContact = useAppSelector(selectIsSectionSaving("contact"));
  const savingGeneral = useAppSelector(selectIsSectionSaving("general"));
  const savingHome = useAppSelector(selectIsSectionSaving("defaultHome"));
  const savingPrivacy = useAppSelector(selectIsSectionSaving("privacyMode"));
  const savingTwoFactor = useAppSelector(
    selectIsSectionSaving("twoFactorEnabled"),
  );

  const contactInitial = useMemo(
    () => ({
      email: user?.email ?? "",
      phoneNumber: user?.phoneNumber ?? "",
    }),
    [user],
  );

  const contact = useDraft(contactInitial);

  const set = (key: string, value: string | boolean, section = key) =>
    dispatch(updateAccount({ [key]: value }, section));

  const saveContact = () =>
    dispatch(
      updateAccount(
        {
          ...contact.changes,
          ...(contact.changes.phoneNumber !== undefined
            ? {
                phoneNumber:
                  contact.changes.phoneNumber === ""
                    ? null
                    : contact.changes.phoneNumber,
              }
            : {}),
        },
        "contact",
      ),
    );

  if (!user) {
    return null;
  }

  return (
    <SettingsPage
      titleKey="page.settings.account.title"
      descriptionKey="page.settings.account.description"
    >
      <SettingsSection
        title={t("settings.account.credentials")}
        description={t("settings.account.credentialsHint")}
      >
        <EditableCard
          isDirty={contact.isDirty}
          isSaving={savingContact}
          onSave={saveContact}
          onReset={contact.reset}
        >
          <FieldRow
            title={t("settings.account.email")}
            description={t("settings.account.emailHint")}
            htmlFor="account-email"
          >
            <div className="flex items-start gap-2">
              <TextInput
                id="account-email"
                type="email"
                value={contact.draft.email}
                error={issues.email}
                onChange={(v) => contact.set("email", v)}
              />
              <div className="pt-2.5">
                <VerifiedBadge
                  verified={user.emailVerified}
                  labels={{
                    yes: t("settings.verified"),
                    no: t("settings.unverified"),
                  }}
                />
              </div>
            </div>
          </FieldRow>

          <FieldRow
            title={t("settings.account.phone")}
            description={t("settings.account.phoneHint")}
            htmlFor="account-phone"
          >
            <div className="flex items-start gap-2">
              <TextInput
                id="account-phone"
                value={contact.draft.phoneNumber}
                placeholder="+1 555 000 1234"
                error={issues.phoneNumber}
                onChange={(v) => contact.set("phoneNumber", v)}
              />
              <div className="pt-2.5">
                <VerifiedBadge
                  verified={user.phoneNumberVerified}
                  labels={{
                    yes: t("settings.verified"),
                    no: t("settings.unverified"),
                  }}
                />
              </div>
            </div>
          </FieldRow>
        </EditableCard>
      </SettingsSection>

      <SettingsSection
        title={t("settings.account.general")}
        description={t("settings.account.generalHint")}
      >
        <InstantCard isSaving={savingGeneral}>
          <FieldRow
            title={t("settings.account.language")}
            description={t("settings.account.languageHint")}
            htmlFor="account-language"
          >
            <Select
              id="account-language"
              value={user.language}
              options={LANGUAGES}
              onChange={(v) => set("language", v, "general")}
            />
          </FieldRow>

          <FieldRow
            title={t("settings.account.timeZone")}
            description={t("settings.account.timeZoneHint")}
            htmlFor="account-timezone"
          >
            <Select
              id="account-timezone"
              value={user.timeZone}
              options={TIMEZONES}
              onChange={(v) => set("timeZone", v, "general")}
            />
          </FieldRow>

          <FieldRow
            title={t("settings.account.appTheme")}
            description={t("settings.account.appThemeHint")}
            htmlFor="account-app-theme"
          >
            <Select
              id="account-app-theme"
              value={user.appTheme}
              options={THEMES}
              onChange={(v) => set("appTheme", v, "general")}
            />
          </FieldRow>

          <FieldRow
            title={t("settings.account.theme")}
            description={t("settings.account.themeHint")}
            htmlFor="account-theme"
          >
            <Select
              id="account-theme"
              value={user.theme}
              options={THEMES}
              onChange={(v) => set("theme", v, "general")}
            />
          </FieldRow>
        </InstantCard>

        <InstantCard isSaving={savingHome}>
          <SettingRow
            title={t("settings.account.defaultHome")}
            description={t("settings.account.defaultHomeHint")}
            htmlFor="account-home"
          >
            <Select
              id="account-home"
              value={user.defaultHome}
              options={HOMES}
              onChange={(v) => set("defaultHome", v)}
            />
          </SettingRow>
        </InstantCard>
      </SettingsSection>

      <SettingsSection
        title={t("settings.account.security")}
        description={t("settings.account.securityHint")}
      >
        <SwitchCard
          id="account-privacy-mode"
          title={t("settings.account.privacyMode")}
          description={t("settings.account.privacyModeHint")}
          checked={user.privacyMode}
          isSaving={savingPrivacy}
          onToggle={(v) => set("privacyMode", v)}
        />
        <SwitchCard
          id="account-2fa"
          title={t("settings.account.twoFactor")}
          description={t("settings.account.twoFactorHint")}
          checked={user.twoFactorEnabled}
          isSaving={savingTwoFactor}
          onToggle={(v) => set("twoFactorEnabled", v)}
        />
      </SettingsSection>
    </SettingsPage>
  );
}

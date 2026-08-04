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
  Select,
  SettingRow,
  SwitchRow,
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
  const savingPreferences = useAppSelector(
    selectIsSectionSaving("preferences"),
  );
  const savingSecurity = useAppSelector(selectIsSectionSaving("security"));

  const contactInitial = useMemo(
    () => ({
      email: user?.email ?? "",
      phoneNumber: user?.phoneNumber ?? "",
    }),
    [user],
  );

  const contact = useDraft(contactInitial);

  const set = (key: string, value: string | boolean, section: string) =>
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
      <EditableCard
        title={t("settings.account.credentials")}
        description={t("settings.account.credentialsHint")}
        isDirty={contact.isDirty}
        isSaving={savingContact}
        onSave={saveContact}
        onReset={contact.reset}
      >
        <SettingRow
          title={t("settings.account.email")}
          htmlFor="account-email"
          error={issues.email}
        >
          <div className="flex items-center gap-2">
            <TextInput
              id="account-email"
              type="email"
              value={contact.draft.email}
              invalid={Boolean(issues.email)}
              onChange={(v) => contact.set("email", v)}
            />
            <VerifiedBadge
              verified={user.emailVerified}
              labels={{
                yes: t("settings.verified"),
                no: t("settings.unverified"),
              }}
            />
          </div>
        </SettingRow>

        <SettingRow
          title={t("settings.account.phone")}
          htmlFor="account-phone"
          error={issues.phoneNumber}
        >
          <div className="flex items-center gap-2">
            <TextInput
              id="account-phone"
              value={contact.draft.phoneNumber}
              placeholder="+1 555 000 1234"
              invalid={Boolean(issues.phoneNumber)}
              onChange={(v) => contact.set("phoneNumber", v)}
            />
            <VerifiedBadge
              verified={user.phoneNumberVerified}
              labels={{
                yes: t("settings.verified"),
                no: t("settings.unverified"),
              }}
            />
          </div>
        </SettingRow>
      </EditableCard>

      <InstantCard
        title={t("settings.account.preferences")}
        description={t("settings.account.preferencesHint")}
        isSaving={savingPreferences}
      >
        <SettingRow
          title={t("settings.account.appTheme")}
          htmlFor="account-app-theme"
        >
          <Select
            id="account-app-theme"
            value={user.appTheme}
            options={THEMES}
            onChange={(v) => set("appTheme", v, "preferences")}
          />
        </SettingRow>
        <SettingRow title={t("settings.account.theme")} htmlFor="account-theme">
          <Select
            id="account-theme"
            value={user.theme}
            options={THEMES}
            onChange={(v) => set("theme", v, "preferences")}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.account.language")}
          htmlFor="account-language"
        >
          <Select
            id="account-language"
            value={user.language}
            options={LANGUAGES}
            onChange={(v) => set("language", v, "preferences")}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.account.timeZone")}
          htmlFor="account-timezone"
        >
          <Select
            id="account-timezone"
            value={user.timeZone}
            options={TIMEZONES}
            onChange={(v) => set("timeZone", v, "preferences")}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.account.defaultHome")}
          description={t("settings.account.defaultHomeHint")}
          htmlFor="account-home"
        >
          <Select
            id="account-home"
            value={user.defaultHome}
            options={HOMES}
            onChange={(v) => set("defaultHome", v, "preferences")}
          />
        </SettingRow>
      </InstantCard>

      <InstantCard
        title={t("settings.account.security")}
        isSaving={savingSecurity}
      >
        <SwitchRow
          id="account-privacy-mode"
          title={t("settings.account.privacyMode")}
          description={t("settings.account.privacyModeHint")}
          checked={user.privacyMode}
          onToggle={(v) => set("privacyMode", v, "security")}
        />
        <SwitchRow
          id="account-2fa"
          title={t("settings.account.twoFactor")}
          description={t("settings.account.twoFactorHint")}
          checked={user.twoFactorEnabled}
          onToggle={(v) => set("twoFactorEnabled", v, "security")}
        />
      </InstantCard>
    </SettingsPage>
  );
}

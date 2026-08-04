import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateAccount } from "@stores/user/actions";
import {
  selectIsUpdating,
  selectUser,
  selectValidationIssues,
} from "@stores/user/selector";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Field,
  FormSection,
  Select,
  TextInput,
  Toggle,
  VerifiedBadge,
} from "@/components/form";
import { SettingsForm } from "./SettingsForm";
import { useSettingsForm } from "./useSettingsForm";

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
  const isSaving = useAppSelector(selectIsUpdating);
  const issues = useAppSelector(selectValidationIssues);

  const initial = useMemo(
    () =>
      user
        ? {
            email: user.email ?? "",
            phoneNumber: user.phoneNumber ?? "",
            theme: user.theme,
            appTheme: user.appTheme,
            language: user.language,
            timeZone: user.timeZone,
            defaultHome: user.defaultHome,
            privacyMode: user.privacyMode,
            twoFactorEnabled: user.twoFactorEnabled,
          }
        : null,
    [user],
  );

  const { draft, set, isDirty, changes, reset } = useSettingsForm(initial);

  const submit = () =>
    dispatch(
      updateAccount({
        ...changes,
        ...(changes.phoneNumber !== undefined
          ? {
              phoneNumber:
                changes.phoneNumber === "" ? null : changes.phoneNumber,
            }
          : {}),
      }),
    );

  return (
    <SettingsForm
      titleKey="page.settings.account.title"
      descriptionKey="page.settings.account.description"
      isDirty={isDirty}
      isSaving={isSaving}
      onSubmit={submit}
      onReset={reset}
    >
      {draft && (
        <>
          <FormSection title={t("settings.account.credentials")}>
            <Field
              label={t("settings.account.email")}
              htmlFor="account-email"
              error={issues.email}
            >
              <div className="flex items-center gap-2">
                <TextInput
                  id="account-email"
                  type="email"
                  value={draft.email}
                  invalid={Boolean(issues.email)}
                  onChange={(v) => set("email", v)}
                />
                <VerifiedBadge verified={Boolean(user?.emailVerified)} />
              </div>
            </Field>

            <Field
              label={t("settings.account.phone")}
              htmlFor="account-phone"
              error={issues.phoneNumber}
            >
              <div className="flex items-center gap-2">
                <TextInput
                  id="account-phone"
                  value={draft.phoneNumber}
                  placeholder="+1 555 000 1234"
                  invalid={Boolean(issues.phoneNumber)}
                  onChange={(v) => set("phoneNumber", v)}
                />
                <VerifiedBadge verified={Boolean(user?.phoneNumberVerified)} />
              </div>
            </Field>
          </FormSection>

          <FormSection title={t("settings.account.preferences")}>
            <Field label={t("settings.account.theme")} htmlFor="account-theme">
              <Select
                id="account-theme"
                value={draft.theme}
                options={THEMES}
                onChange={(v) => set("theme", v)}
              />
            </Field>
            <Field
              label={t("settings.account.appTheme")}
              htmlFor="account-app-theme"
            >
              <Select
                id="account-app-theme"
                value={draft.appTheme}
                options={THEMES}
                onChange={(v) => set("appTheme", v)}
              />
            </Field>
            <Field
              label={t("settings.account.language")}
              htmlFor="account-language"
            >
              <Select
                id="account-language"
                value={draft.language}
                options={LANGUAGES}
                onChange={(v) => set("language", v)}
              />
            </Field>
            <Field
              label={t("settings.account.timeZone")}
              htmlFor="account-timezone"
            >
              <Select
                id="account-timezone"
                value={draft.timeZone}
                options={TIMEZONES}
                onChange={(v) => set("timeZone", v)}
              />
            </Field>
            <Field
              label={t("settings.account.defaultHome")}
              htmlFor="account-home"
            >
              <Select
                id="account-home"
                value={draft.defaultHome}
                options={HOMES}
                onChange={(v) => set("defaultHome", v)}
              />
            </Field>
          </FormSection>

          <FormSection title={t("settings.account.security")}>
            <Toggle
              id="account-privacy-mode"
              label={t("settings.account.privacyMode")}
              description={t("settings.account.privacyModeHint")}
              checked={draft.privacyMode}
              onChange={(v) => set("privacyMode", v)}
            />
            <Toggle
              id="account-2fa"
              label={t("settings.account.twoFactor")}
              description={t("settings.account.twoFactorHint")}
              checked={draft.twoFactorEnabled}
              onChange={(v) => set("twoFactorEnabled", v)}
            />
          </FormSection>
        </>
      )}
    </SettingsForm>
  );
}

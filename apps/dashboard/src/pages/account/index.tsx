import { Button } from "@4mica/ui";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateAccount } from "@stores/user/actions";
import { selectIsSectionSaving, selectUser } from "@stores/user/selector";
import { useTranslation } from "react-i18next";
import { VerifiedBadge } from "@/components/badges";
import { InstantCard } from "@/components/EditableCard";
import { FieldRow, Select, SettingRow, SwitchCard } from "@/components/form";
import { SettingsSection, SurfaceCard } from "@/components/layout";
import { SettingsPage } from "@/components/SettingsPage";

const THEMES = [
  { title: "Dark", value: "dark" },
  { title: "Light", value: "light" },
  { title: "System", value: "system" },
];

const LANGUAGES = [
  { title: "English", value: "en" },
  { title: "Deutsch", value: "de" },
  { title: "Français", value: "fr" },
  { title: "Español", value: "es" },
];

const HOMES = [
  { title: "Overview", value: "overview" },
  { title: "Balances", value: "balances" },
  { title: "Transactions", value: "transactions" },
  { title: "Payments", value: "payments" },
  { title: "Agents", value: "agents" },
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
].map((zone) => ({ title: zone, value: zone }));

export function AccountSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const savingGeneral = useAppSelector(selectIsSectionSaving("general"));
  const savingHome = useAppSelector(selectIsSectionSaving("defaultHome"));
  const savingPrivacy = useAppSelector(selectIsSectionSaving("privacyMode"));
  // Clerk enforces the second factor, so it is the only honest source for
  // whether one is set up. The dashboard reads it and hands off to Clerk.
  const { user: clerkUser } = useUser();
  const { openUserProfile } = useClerk();

  const set = (key: string, value: string | boolean, section = key) =>
    dispatch(updateAccount({ [key]: value }, section));

  if (!user) {
    return null;
  }

  return (
    <SettingsPage
      titleKey="page.settings.account.title"
      descriptionKey="page.settings.account.description"
    >
      <section className="flex flex-col gap-3">
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
              hasSearch
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
      </section>

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
        <SurfaceCard className="flex items-center justify-between gap-4">
          <div>
            <span className="font-medium text-ink-strong text-sm">
              {t("settings.account.twoFactor")}
            </span>
            <p className="mt-0.5 text-ink-muted text-xs">
              {t("settings.account.twoFactorHint")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <VerifiedBadge
              verified={Boolean(clerkUser?.twoFactorEnabled)}
              labels={{
                yes: t("settings.account.twoFactorOn"),
                no: t("settings.account.twoFactorOff"),
              }}
            />
            <Button
              type="button"
              intent="ghost"
              size="sm"
              className="btn-no-lift"
              onClick={() => openUserProfile()}
            >
              {t("settings.account.twoFactorManage")}
            </Button>
          </div>
        </SurfaceCard>
      </SettingsSection>
    </SettingsPage>
  );
}

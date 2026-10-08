import { Button } from "@4mica/ui";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { sendEmailVerification, updateAccount } from "@stores/user/actions";
import {
  selectIsSectionSaving,
  selectUser,
  selectValidationIssues,
} from "@stores/user/selector";
import { hasErrors, isEmail, isPhoneNumber } from "@utils/validation";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EditableCard, InstantCard } from "@/components/EditableCard";
import {
  Card,
  FieldRow,
  Select,
  SettingRow,
  SettingsSection,
  SwitchCard,
  TextInput,
  VerifiedBadge,
} from "@/components/form";
import { SettingsPage } from "@/components/SettingsPage";
import { useDraft } from "@/hooks/useDraft";

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
  const issues = useAppSelector(selectValidationIssues);
  const savingContact = useAppSelector(selectIsSectionSaving("contact"));
  const savingGeneral = useAppSelector(selectIsSectionSaving("general"));
  const savingHome = useAppSelector(selectIsSectionSaving("defaultHome"));
  const savingPrivacy = useAppSelector(selectIsSectionSaving("privacyMode"));
  const sendingVerification = useAppSelector(
    selectIsSectionSaving("emailVerification"),
  );
  // Clerk enforces the second factor, so it is the only honest source for
  // whether one is set up. The dashboard reads it and hands off to Clerk.
  const { user: clerkUser } = useUser();
  const { openUserProfile } = useClerk();

  const contactInitial = useMemo(
    () => ({
      email: user?.email ?? "",
      phoneNumber: user?.phoneNumber ?? "",
    }),
    [user],
  );

  const contact = useDraft(contactInitial);

  const emailValue = contact.draft.email.trim();
  const phoneValue = contact.draft.phoneNumber.trim();
  const contactErrors = {
    email:
      emailValue === ""
        ? t("validation.required")
        : emailValue.length > 255
          ? t("validation.tooLong", { max: 255 })
          : !isEmail(emailValue)
            ? t("validation.email")
            : undefined,
    phoneNumber:
      phoneValue === "" || isPhoneNumber(phoneValue)
        ? undefined
        : t("validation.phone"),
  };

  const set = (key: string, value: string | boolean, section = key) =>
    dispatch(updateAccount({ [key]: value }, section));

  const saveContact = () =>
    dispatch(
      updateAccount(
        {
          ...(contact.changes.email !== undefined
            ? { email: contact.changes.email.trim().toLowerCase() }
            : {}),
          ...(contact.changes.phoneNumber !== undefined
            ? {
                phoneNumber:
                  contact.changes.phoneNumber.trim() === ""
                    ? null
                    : contact.changes.phoneNumber.trim(),
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
          isInvalid={hasErrors(contactErrors)}
          isSaving={savingContact}
          onSave={saveContact}
          onReset={contact.reset}
        >
          <FieldRow
            title={t("settings.account.email")}
            description={t("settings.account.emailHint")}
            htmlFor="account-email"
            action={
              <VerifiedBadge
                verified={user.emailVerified}
                labels={{
                  yes: t("settings.verified"),
                  no: t("settings.unverified"),
                }}
              />
            }
          >
            <TextInput
              id="account-email"
              type="email"
              value={contact.draft.email}
              error={contactErrors.email ?? issues.email}
              maxLength={255}
              onChange={(v) => contact.set("email", v)}
            />
            {user.pendingEmail ? (
              <p className="mt-2 text-ink-muted text-xs">
                {t("settings.account.emailPending", {
                  email: user.pendingEmail,
                })}{" "}
                <button
                  type="button"
                  className="font-medium text-ink-strong underline disabled:opacity-50"
                  disabled={sendingVerification}
                  onClick={() => dispatch(sendEmailVerification())}
                >
                  {t("settings.account.emailPendingResend")}
                </button>
              </p>
            ) : null}
          </FieldRow>

          <FieldRow
            title={t("settings.account.phone")}
            description={t("settings.account.phoneHint")}
            htmlFor="account-phone"
            action={
              <VerifiedBadge
                verified={user.phoneNumberVerified}
                labels={{
                  yes: t("settings.verified"),
                  no: t("settings.unverified"),
                }}
              />
            }
          >
            <TextInput
              id="account-phone"
              value={contact.draft.phoneNumber}
              placeholder="+1 555 000 1234"
              error={contactErrors.phoneNumber ?? issues.phoneNumber}
              maxLength={20}
              onChange={(v) => contact.set("phoneNumber", v)}
            />
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
        <Card className="flex items-center justify-between gap-4">
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
        </Card>
      </SettingsSection>
    </SettingsPage>
  );
}

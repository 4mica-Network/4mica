import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateNotifications } from "@stores/user/actions";
import {
  selectIsUpdating,
  selectUser,
  selectValidationIssues,
} from "@stores/user/selector";
import type { NotificationPlacement } from "@stores/user/type";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Field, FormSection, Select, Toggle } from "@/components/form";
import { SettingsForm } from "./SettingsForm";
import { useSettingsForm } from "./useSettingsForm";

const PLACEMENTS = [
  { label: "Top left", value: "topLeft" },
  { label: "Top right", value: "topRight" },
  { label: "Bottom left", value: "bottomLeft" },
  { label: "Bottom right", value: "bottomRight" },
];

export function NotificationSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const isSaving = useAppSelector(selectIsUpdating);
  const issues = useAppSelector(selectValidationIssues);

  const initial = useMemo(
    () =>
      user
        ? {
            allowNotification: user.allowNotification,
            allowSMS: user.allowSMS,
            notificationPlacement: user.notificationPlacement,
            allowMonthlyEmails: user.allowMonthlyEmails,
            allowInviteAcceptedEmails: user.allowInviteAcceptedEmails,
            allowChangelogNewsletterEmails: user.allowChangelogNewsletterEmails,
            allowMarketingOnboardingEmails: user.allowMarketingOnboardingEmails,
            allowPrivacyLegalEmails: user.allowPrivacyLegalEmails,
            allowDpaEmails: user.allowDpaEmails,
          }
        : null,
    [user],
  );

  const { draft, set, isDirty, changes, reset } = useSettingsForm(initial);

  return (
    <SettingsForm
      titleKey="page.settings.notifications.title"
      descriptionKey="page.settings.notifications.description"
      isDirty={isDirty}
      isSaving={isSaving}
      onSubmit={() => dispatch(updateNotifications(changes))}
      onReset={reset}
    >
      {draft && (
        <>
          <FormSection title={t("settings.notifications.channels")}>
            <Toggle
              id="notif-enabled"
              label={t("settings.notifications.inApp")}
              description={t("settings.notifications.inAppHint")}
              checked={draft.allowNotification}
              onChange={(v) => set("allowNotification", v)}
            />
            <Toggle
              id="notif-sms"
              label={t("settings.notifications.sms")}
              checked={draft.allowSMS}
              onChange={(v) => set("allowSMS", v)}
            />
            <Field
              label={t("settings.notifications.placement")}
              htmlFor="notif-placement"
              error={issues.notificationPlacement}
            >
              <Select
                id="notif-placement"
                value={draft.notificationPlacement}
                options={PLACEMENTS}
                disabled={!draft.allowNotification}
                onChange={(v) =>
                  set("notificationPlacement", v as NotificationPlacement)
                }
              />
            </Field>
          </FormSection>

          <FormSection
            title={t("settings.notifications.emails")}
            description={t("settings.notifications.emailsHint")}
          >
            <Toggle
              id="notif-monthly"
              label={t("settings.notifications.monthly")}
              checked={draft.allowMonthlyEmails}
              onChange={(v) => set("allowMonthlyEmails", v)}
            />
            <Toggle
              id="notif-invite"
              label={t("settings.notifications.invites")}
              checked={draft.allowInviteAcceptedEmails}
              onChange={(v) => set("allowInviteAcceptedEmails", v)}
            />
            <Toggle
              id="notif-changelog"
              label={t("settings.notifications.changelog")}
              checked={draft.allowChangelogNewsletterEmails}
              onChange={(v) => set("allowChangelogNewsletterEmails", v)}
            />
            <Toggle
              id="notif-marketing"
              label={t("settings.notifications.marketing")}
              checked={draft.allowMarketingOnboardingEmails}
              onChange={(v) => set("allowMarketingOnboardingEmails", v)}
            />
          </FormSection>

          <FormSection
            title={t("settings.notifications.legal")}
            description={t("settings.notifications.legalHint")}
          >
            <Toggle
              id="notif-privacy"
              label={t("settings.notifications.privacy")}
              checked={draft.allowPrivacyLegalEmails}
              onChange={(v) => set("allowPrivacyLegalEmails", v)}
            />
            <Toggle
              id="notif-dpa"
              label={t("settings.notifications.dpa")}
              checked={draft.allowDpaEmails}
              onChange={(v) => set("allowDpaEmails", v)}
            />
          </FormSection>
        </>
      )}
    </SettingsForm>
  );
}

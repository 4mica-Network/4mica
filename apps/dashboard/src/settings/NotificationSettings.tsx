import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateNotifications } from "@stores/user/actions";
import {
  selectIsSectionSaving,
  selectUser,
  selectValidationIssues,
} from "@stores/user/selector";
import type { NotificationPlacement } from "@stores/user/type";
import { useTranslation } from "react-i18next";
import { Select, SettingRow, SwitchRow } from "@/components/form";
import { InstantCard } from "./EditableCard";
import { SettingsPage } from "./SettingsPage";

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
  const issues = useAppSelector(selectValidationIssues);
  const savingChannels = useAppSelector(selectIsSectionSaving("channels"));
  const savingEmails = useAppSelector(selectIsSectionSaving("emails"));
  const savingLegal = useAppSelector(selectIsSectionSaving("legal"));

  const set = (
    key: string,
    value: boolean | NotificationPlacement,
    section: string,
  ) => dispatch(updateNotifications({ [key]: value }, section));

  if (!user) {
    return null;
  }

  return (
    <SettingsPage
      titleKey="page.settings.notifications.title"
      descriptionKey="page.settings.notifications.description"
    >
      <InstantCard
        title={t("settings.notifications.channels")}
        description={t("settings.notifications.channelsHint")}
        isSaving={savingChannels}
      >
        <SwitchRow
          id="notif-enabled"
          title={t("settings.notifications.inApp")}
          description={t("settings.notifications.inAppHint")}
          checked={user.allowNotification}
          onToggle={(v) => set("allowNotification", v, "channels")}
        />
        <SwitchRow
          id="notif-sms"
          title={t("settings.notifications.sms")}
          description={t("settings.notifications.smsHint")}
          checked={user.allowSMS}
          onToggle={(v) => set("allowSMS", v, "channels")}
        />
        <SettingRow
          title={t("settings.notifications.placement")}
          description={t("settings.notifications.placementHint")}
          htmlFor="notif-placement"
          error={issues.notificationPlacement}
        >
          <Select
            id="notif-placement"
            value={user.notificationPlacement}
            options={PLACEMENTS}
            disabled={!user.allowNotification}
            onChange={(v) =>
              set(
                "notificationPlacement",
                v as NotificationPlacement,
                "channels",
              )
            }
          />
        </SettingRow>
      </InstantCard>

      <InstantCard
        title={t("settings.notifications.emails")}
        description={t("settings.notifications.emailsHint")}
        isSaving={savingEmails}
      >
        <SwitchRow
          id="notif-monthly"
          title={t("settings.notifications.monthly")}
          description={t("settings.notifications.monthlyHint")}
          checked={user.allowMonthlyEmails}
          onToggle={(v) => set("allowMonthlyEmails", v, "emails")}
        />
        <SwitchRow
          id="notif-invite"
          title={t("settings.notifications.invites")}
          checked={user.allowInviteAcceptedEmails}
          onToggle={(v) => set("allowInviteAcceptedEmails", v, "emails")}
        />
        <SwitchRow
          id="notif-changelog"
          title={t("settings.notifications.changelog")}
          checked={user.allowChangelogNewsletterEmails}
          onToggle={(v) => set("allowChangelogNewsletterEmails", v, "emails")}
        />
        <SwitchRow
          id="notif-marketing"
          title={t("settings.notifications.marketing")}
          checked={user.allowMarketingOnboardingEmails}
          onToggle={(v) => set("allowMarketingOnboardingEmails", v, "emails")}
        />
      </InstantCard>

      <InstantCard
        title={t("settings.notifications.legal")}
        description={t("settings.notifications.legalHint")}
        isSaving={savingLegal}
      >
        <SwitchRow
          id="notif-privacy"
          title={t("settings.notifications.privacy")}
          checked={user.allowPrivacyLegalEmails}
          onToggle={(v) => set("allowPrivacyLegalEmails", v, "legal")}
        />
        <SwitchRow
          id="notif-dpa"
          title={t("settings.notifications.dpa")}
          checked={user.allowDpaEmails}
          onToggle={(v) => set("allowDpaEmails", v, "legal")}
        />
      </InstantCard>
    </SettingsPage>
  );
}

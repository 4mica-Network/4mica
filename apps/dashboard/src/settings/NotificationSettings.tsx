import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateNotifications } from "@stores/user/actions";
import { selectIsSectionSaving, selectUser } from "@stores/user/selector";
import type { NotificationPlacement } from "@stores/user/type";
import { useTranslation } from "react-i18next";
import {
  Select,
  SettingRow,
  SettingsSection,
  SwitchCard,
} from "@/components/form";
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

  const savingInApp = useAppSelector(
    selectIsSectionSaving("allowNotification"),
  );
  const savingSms = useAppSelector(selectIsSectionSaving("allowSMS"));
  const savingPlacement = useAppSelector(
    selectIsSectionSaving("notificationPlacement"),
  );
  const savingMonthly = useAppSelector(
    selectIsSectionSaving("allowMonthlyEmails"),
  );
  const savingInvites = useAppSelector(
    selectIsSectionSaving("allowInviteAcceptedEmails"),
  );
  const savingChangelog = useAppSelector(
    selectIsSectionSaving("allowChangelogNewsletterEmails"),
  );
  const savingMarketing = useAppSelector(
    selectIsSectionSaving("allowMarketingOnboardingEmails"),
  );
  const savingPrivacy = useAppSelector(
    selectIsSectionSaving("allowPrivacyLegalEmails"),
  );
  const savingDpa = useAppSelector(selectIsSectionSaving("allowDpaEmails"));

  const set = (key: string, value: boolean | NotificationPlacement) =>
    dispatch(updateNotifications({ [key]: value }, key));

  if (!user) {
    return null;
  }

  return (
    <SettingsPage
      titleKey="page.settings.notifications.title"
      descriptionKey="page.settings.notifications.description"
    >
      <SettingsSection
        title={t("settings.notifications.channels")}
        description={t("settings.notifications.channelsHint")}
      >
        <SwitchCard
          id="notif-enabled"
          title={t("settings.notifications.inApp")}
          description={t("settings.notifications.inAppHint")}
          checked={user.allowNotification}
          isSaving={savingInApp}
          onToggle={(v) => set("allowNotification", v)}
        />
        <SwitchCard
          id="notif-sms"
          title={t("settings.notifications.sms")}
          description={t("settings.notifications.smsHint")}
          checked={user.allowSMS}
          isSaving={savingSms}
          onToggle={(v) => set("allowSMS", v)}
        />
        <InstantCard isSaving={savingPlacement}>
          <SettingRow
            title={t("settings.notifications.placement")}
            description={t("settings.notifications.placementHint")}
            htmlFor="notif-placement"
          >
            <Select
              id="notif-placement"
              value={user.notificationPlacement}
              options={PLACEMENTS}
              disabled={!user.allowNotification}
              onChange={(v) =>
                set("notificationPlacement", v as NotificationPlacement)
              }
            />
          </SettingRow>
        </InstantCard>
      </SettingsSection>

      <SettingsSection
        title={t("settings.notifications.emails")}
        description={t("settings.notifications.emailsHint")}
      >
        <SwitchCard
          id="notif-monthly"
          title={t("settings.notifications.monthly")}
          description={t("settings.notifications.monthlyHint")}
          checked={user.allowMonthlyEmails}
          isSaving={savingMonthly}
          onToggle={(v) => set("allowMonthlyEmails", v)}
        />
        <SwitchCard
          id="notif-invite"
          title={t("settings.notifications.invites")}
          description={t("settings.notifications.invitesHint")}
          checked={user.allowInviteAcceptedEmails}
          isSaving={savingInvites}
          onToggle={(v) => set("allowInviteAcceptedEmails", v)}
        />
        <SwitchCard
          id="notif-changelog"
          title={t("settings.notifications.changelog")}
          description={t("settings.notifications.changelogHint")}
          checked={user.allowChangelogNewsletterEmails}
          isSaving={savingChangelog}
          onToggle={(v) => set("allowChangelogNewsletterEmails", v)}
        />
        <SwitchCard
          id="notif-marketing"
          title={t("settings.notifications.marketing")}
          description={t("settings.notifications.marketingHint")}
          checked={user.allowMarketingOnboardingEmails}
          isSaving={savingMarketing}
          onToggle={(v) => set("allowMarketingOnboardingEmails", v)}
        />
      </SettingsSection>

      <SettingsSection
        title={t("settings.notifications.legal")}
        description={t("settings.notifications.legalHint")}
      >
        <SwitchCard
          id="notif-privacy"
          title={t("settings.notifications.privacy")}
          description={t("settings.notifications.privacyHint")}
          checked={user.allowPrivacyLegalEmails}
          isSaving={savingPrivacy}
          onToggle={(v) => set("allowPrivacyLegalEmails", v)}
        />
        <SwitchCard
          id="notif-dpa"
          title={t("settings.notifications.dpa")}
          description={t("settings.notifications.dpaHint")}
          checked={user.allowDpaEmails}
          isSaving={savingDpa}
          onToggle={(v) => set("allowDpaEmails", v)}
        />
      </SettingsSection>
    </SettingsPage>
  );
}

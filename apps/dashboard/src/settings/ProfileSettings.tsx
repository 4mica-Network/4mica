import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateProfile } from "@stores/user/actions";
import {
  selectIsSectionSaving,
  selectUser,
  selectValidationIssues,
} from "@stores/user/selector";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  SettingRow,
  SwitchRow,
  TextArea,
  TextInput,
  VerifiedBadge,
} from "@/components/form";
import { EditableCard, InstantCard } from "./EditableCard";
import { SettingsPage } from "./SettingsPage";
import { useDraft } from "./useDraft";

export function ProfileSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const issues = useAppSelector(selectValidationIssues);
  const savingIdentity = useAppSelector(selectIsSectionSaving("identity"));
  const savingVisibility = useAppSelector(selectIsSectionSaving("visibility"));
  const savingBranding = useAppSelector(selectIsSectionSaving("branding"));
  const savingColors = useAppSelector(selectIsSectionSaving("colors"));

  const identityInitial = useMemo(
    () => ({
      name: user?.name ?? "",
      username: user?.username ?? "",
      bio: user?.bio ?? "",
      description: user?.description ?? "",
    }),
    [user],
  );

  const colorsInitial = useMemo(
    () => ({
      primaryBrandColor: user?.primaryBrandColor ?? "",
      secondaryBrandColor: user?.secondaryBrandColor ?? "",
    }),
    [user],
  );

  const identity = useDraft(identityInitial);
  const colors = useDraft(colorsInitial);

  const toggle = (key: string, value: boolean, section: string) =>
    dispatch(updateProfile({ [key]: value }, section));

  const saveIdentity = () =>
    dispatch(
      updateProfile(
        Object.fromEntries(
          Object.entries(identity.changes).map(([k, v]) => [
            k,
            v === "" && k !== "name" ? null : v,
          ]),
        ),
        "identity",
      ),
    );

  if (!user) {
    return null;
  }

  return (
    <SettingsPage
      titleKey="page.settings.profile.title"
      descriptionKey="page.settings.profile.description"
    >
      <Card className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-ink-strong text-sm">
            {t("settings.profile.accountStatus")}
          </h3>
          <p className="mt-0.5 text-ink-muted text-xs">
            {t("settings.profile.accountStatusHint")}
          </p>
        </div>
        <VerifiedBadge
          verified={user.verified}
          labels={{ yes: t("settings.verified"), no: t("settings.unverified") }}
        />
      </Card>

      <EditableCard
        title={t("settings.profile.identity")}
        description={t("settings.profile.identityHint")}
        isDirty={identity.isDirty}
        isSaving={savingIdentity}
        onSave={saveIdentity}
        onReset={identity.reset}
      >
        <SettingRow
          title={t("settings.profile.name")}
          htmlFor="profile-name"
          error={issues.name}
        >
          <TextInput
            id="profile-name"
            value={identity.draft.name}
            invalid={Boolean(issues.name)}
            onChange={(v) => identity.set("name", v)}
          />
        </SettingRow>

        <SettingRow
          title={t("settings.profile.username")}
          description={t("settings.profile.usernameHint")}
          htmlFor="profile-username"
          error={issues.username}
        >
          <TextInput
            id="profile-username"
            value={identity.draft.username}
            invalid={Boolean(issues.username)}
            onChange={(v) => identity.set("username", v.toLowerCase())}
          />
        </SettingRow>

        <SettingRow
          title={t("settings.profile.bio")}
          htmlFor="profile-bio"
          error={issues.bio}
        >
          <TextArea
            id="profile-bio"
            value={identity.draft.bio}
            invalid={Boolean(issues.bio)}
            onChange={(v) => identity.set("bio", v)}
          />
        </SettingRow>

        <SettingRow
          title={t("settings.profile.description")}
          htmlFor="profile-description"
          error={issues.description}
        >
          <TextArea
            id="profile-description"
            value={identity.draft.description}
            invalid={Boolean(issues.description)}
            onChange={(v) => identity.set("description", v)}
          />
        </SettingRow>
      </EditableCard>

      <InstantCard
        title={t("settings.profile.visibility")}
        description={t("settings.profile.visibilityHint")}
        isSaving={savingVisibility}
      >
        <SwitchRow
          id="profile-private"
          title={t("settings.profile.private")}
          description={t("settings.profile.privateHint")}
          checked={user.private}
          onToggle={(v) => toggle("private", v, "visibility")}
        />
        <SwitchRow
          id="profile-hidden"
          title={t("settings.profile.hidden")}
          checked={user.hidden}
          onToggle={(v) => toggle("hidden", v, "visibility")}
        />
        <SwitchRow
          id="profile-seo"
          title={t("settings.profile.seo")}
          checked={user.allowSEOIndexing}
          onToggle={(v) => toggle("allowSEOIndexing", v, "visibility")}
        />
        <SwitchRow
          id="profile-email-visibility"
          title={t("settings.profile.emailVisibility")}
          checked={user.allowEmailVisibility}
          onToggle={(v) => toggle("allowEmailVisibility", v, "visibility")}
        />
        <SwitchRow
          id="profile-phone-visibility"
          title={t("settings.profile.phoneVisibility")}
          checked={user.allowPhoneNumberVisibility}
          onToggle={(v) =>
            toggle("allowPhoneNumberVisibility", v, "visibility")
          }
        />
      </InstantCard>

      <InstantCard
        title={t("settings.profile.branding")}
        isSaving={savingBranding}
      >
        <SwitchRow
          id="profile-custom-brand"
          title={t("settings.profile.customBrand")}
          checked={user.allowCustomBrandColor}
          onToggle={(v) => toggle("allowCustomBrandColor", v, "branding")}
        />
        <SwitchRow
          id="profile-disable-branding"
          title={t("settings.profile.disableBranding")}
          checked={user.disableBranding}
          onToggle={(v) => toggle("disableBranding", v, "branding")}
        />
      </InstantCard>

      {user.allowCustomBrandColor && (
        <EditableCard
          title={t("settings.profile.brandColors")}
          description={t("settings.profile.colorHint")}
          isDirty={colors.isDirty}
          isSaving={savingColors}
          onSave={() => dispatch(updateProfile(colors.changes, "colors"))}
          onReset={colors.reset}
        >
          <SettingRow
            title={t("settings.profile.primaryColor")}
            htmlFor="profile-primary-color"
            error={issues.primaryBrandColor}
          >
            <TextInput
              id="profile-primary-color"
              value={colors.draft.primaryBrandColor}
              placeholder="#4f46e5"
              invalid={Boolean(issues.primaryBrandColor)}
              onChange={(v) => colors.set("primaryBrandColor", v)}
            />
          </SettingRow>
          <SettingRow
            title={t("settings.profile.secondaryColor")}
            htmlFor="profile-secondary-color"
            error={issues.secondaryBrandColor}
          >
            <TextInput
              id="profile-secondary-color"
              value={colors.draft.secondaryBrandColor}
              placeholder="#0ea5e9"
              invalid={Boolean(issues.secondaryBrandColor)}
              onChange={(v) => colors.set("secondaryBrandColor", v)}
            />
          </SettingRow>
        </EditableCard>
      )}
    </SettingsPage>
  );
}

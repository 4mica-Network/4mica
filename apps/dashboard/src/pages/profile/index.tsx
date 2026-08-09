import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateProfile } from "@stores/user/actions";
import {
  selectIsSectionSaving,
  selectUser,
  selectValidationIssues,
} from "@stores/user/selector";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EditableCard } from "@/components/EditableCard";
import {
  Card,
  FieldRow,
  SettingsSection,
  SwitchCard,
  TextArea,
  TextInput,
  VerifiedBadge,
} from "@/components/form";
import { SettingsPage } from "@/components/SettingsPage";
import { useDraft } from "@/hooks/useDraft";

export function ProfileSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const issues = useAppSelector(selectValidationIssues);

  const savingIdentity = useAppSelector(selectIsSectionSaving("identity"));
  const savingColors = useAppSelector(selectIsSectionSaving("colors"));
  const savingPrivate = useAppSelector(selectIsSectionSaving("private"));
  const savingHidden = useAppSelector(selectIsSectionSaving("hidden"));
  const savingSeo = useAppSelector(selectIsSectionSaving("allowSEOIndexing"));
  const savingEmailVis = useAppSelector(
    selectIsSectionSaving("allowEmailVisibility"),
  );
  const savingPhoneVis = useAppSelector(
    selectIsSectionSaving("allowPhoneNumberVisibility"),
  );
  const savingCustomBrand = useAppSelector(
    selectIsSectionSaving("allowCustomBrandColor"),
  );
  const savingDisableBranding = useAppSelector(
    selectIsSectionSaving("disableBranding"),
  );

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

  const toggle = (key: string, value: boolean) =>
    dispatch(updateProfile({ [key]: value }, key));

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
      <SettingsSection
        title={t("settings.profile.identity")}
        description={t("settings.profile.identityHint")}
      >
        <Card className="flex items-center justify-between gap-4">
          <div>
            <span className="font-medium text-ink-strong text-sm">
              {t("settings.profile.accountStatus")}
            </span>
            <p className="mt-0.5 text-ink-muted text-xs">
              {t("settings.profile.accountStatusHint")}
            </p>
          </div>
          <VerifiedBadge
            verified={user.verified}
            labels={{
              yes: t("settings.verified"),
              no: t("settings.unverified"),
            }}
          />
        </Card>

        <EditableCard
          isDirty={identity.isDirty}
          isSaving={savingIdentity}
          onSave={saveIdentity}
          onReset={identity.reset}
        >
          <FieldRow
            title={t("settings.profile.name")}
            description={t("settings.profile.nameHint")}
            htmlFor="profile-name"
          >
            <TextInput
              id="profile-name"
              value={identity.draft.name}
              error={issues.name}
              onChange={(v) => identity.set("name", v)}
            />
          </FieldRow>

          <FieldRow
            title={t("settings.profile.username")}
            description={t("settings.profile.usernameHint")}
            htmlFor="profile-username"
          >
            <TextInput
              id="profile-username"
              value={identity.draft.username}
              error={issues.username}
              format="lowercase"
              onChange={(v) => identity.set("username", v)}
            />
          </FieldRow>

          <FieldRow
            title={t("settings.profile.bio")}
            description={t("settings.profile.bioHint")}
            htmlFor="profile-bio"
          >
            <TextArea
              id="profile-bio"
              value={identity.draft.bio}
              error={issues.bio}
              onChange={(v) => identity.set("bio", v)}
            />
          </FieldRow>

          <FieldRow
            title={t("settings.profile.description")}
            description={t("settings.profile.descriptionHint")}
            htmlFor="profile-description"
          >
            <TextArea
              id="profile-description"
              value={identity.draft.description}
              error={issues.description}
              onChange={(v) => identity.set("description", v)}
            />
          </FieldRow>
        </EditableCard>
      </SettingsSection>

      <SettingsSection
        title={t("settings.profile.visibility")}
        description={t("settings.profile.visibilityHint")}
      >
        <SwitchCard
          id="profile-private"
          title={t("settings.profile.private")}
          description={t("settings.profile.privateHint")}
          checked={user.private}
          isSaving={savingPrivate}
          onToggle={(v) => toggle("private", v)}
        />
        <SwitchCard
          id="profile-hidden"
          title={t("settings.profile.hidden")}
          description={t("settings.profile.hiddenHint")}
          checked={user.hidden}
          isSaving={savingHidden}
          onToggle={(v) => toggle("hidden", v)}
        />
        <SwitchCard
          id="profile-seo"
          title={t("settings.profile.seo")}
          description={t("settings.profile.seoHint")}
          checked={user.allowSEOIndexing}
          isSaving={savingSeo}
          onToggle={(v) => toggle("allowSEOIndexing", v)}
        />
        <SwitchCard
          id="profile-email-visibility"
          title={t("settings.profile.emailVisibility")}
          description={t("settings.profile.emailVisibilityHint")}
          checked={user.allowEmailVisibility}
          isSaving={savingEmailVis}
          onToggle={(v) => toggle("allowEmailVisibility", v)}
        />
        <SwitchCard
          id="profile-phone-visibility"
          title={t("settings.profile.phoneVisibility")}
          description={t("settings.profile.phoneVisibilityHint")}
          checked={user.allowPhoneNumberVisibility}
          isSaving={savingPhoneVis}
          onToggle={(v) => toggle("allowPhoneNumberVisibility", v)}
        />
      </SettingsSection>

      <SettingsSection
        title={t("settings.profile.branding")}
        description={t("settings.profile.brandingHint")}
      >
        <SwitchCard
          id="profile-custom-brand"
          title={t("settings.profile.customBrand")}
          description={t("settings.profile.customBrandHint")}
          checked={user.allowCustomBrandColor}
          isSaving={savingCustomBrand}
          onToggle={(v) => toggle("allowCustomBrandColor", v)}
        />
        <SwitchCard
          id="profile-disable-branding"
          title={t("settings.profile.disableBranding")}
          description={t("settings.profile.disableBrandingHint")}
          checked={user.disableBranding}
          isSaving={savingDisableBranding}
          onToggle={(v) => toggle("disableBranding", v)}
        />

        {user.allowCustomBrandColor && (
          <EditableCard
            isDirty={colors.isDirty}
            isSaving={savingColors}
            onSave={() => dispatch(updateProfile(colors.changes, "colors"))}
            onReset={colors.reset}
          >
            <FieldRow
              title={t("settings.profile.primaryColor")}
              description={t("settings.profile.primaryColorHint")}
              htmlFor="profile-primary-color"
            >
              <TextInput
                id="profile-primary-color"
                value={colors.draft.primaryBrandColor}
                placeholder="#4f46e5"
                error={issues.primaryBrandColor}
                onChange={(v) => colors.set("primaryBrandColor", v)}
              />
            </FieldRow>
            <FieldRow
              title={t("settings.profile.secondaryColor")}
              description={t("settings.profile.secondaryColorHint")}
              htmlFor="profile-secondary-color"
            >
              <TextInput
                id="profile-secondary-color"
                value={colors.draft.secondaryBrandColor}
                placeholder="#0ea5e9"
                error={issues.secondaryBrandColor}
                onChange={(v) => colors.set("secondaryBrandColor", v)}
              />
            </FieldRow>
          </EditableCard>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}

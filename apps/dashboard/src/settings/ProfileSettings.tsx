import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateProfile } from "@stores/user/actions";
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
  TextArea,
  TextInput,
  Toggle,
  VerifiedBadge,
} from "@/components/form";
import { SettingsForm } from "./SettingsForm";
import { useSettingsForm } from "./useSettingsForm";

export function ProfileSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const isSaving = useAppSelector(selectIsUpdating);
  const issues = useAppSelector(selectValidationIssues);

  const initial = useMemo(
    () =>
      user
        ? {
            name: user.name,
            username: user.username ?? "",
            bio: user.bio ?? "",
            description: user.description ?? "",
            private: user.private,
            hidden: user.hidden,
            allowSEOIndexing: user.allowSEOIndexing,
            allowEmailVisibility: user.allowEmailVisibility,
            allowPhoneNumberVisibility: user.allowPhoneNumberVisibility,
            allowCustomBrandColor: user.allowCustomBrandColor,
            primaryBrandColor: user.primaryBrandColor,
            secondaryBrandColor: user.secondaryBrandColor,
            disableBranding: user.disableBranding,
          }
        : null,
    [user],
  );

  const { draft, set, isDirty, changes, reset } = useSettingsForm(initial);

  const submit = () =>
    dispatch(
      updateProfile({
        ...changes,
        ...(changes.username !== undefined
          ? { username: changes.username === "" ? null : changes.username }
          : {}),
        ...(changes.bio !== undefined
          ? { bio: changes.bio === "" ? null : changes.bio }
          : {}),
        ...(changes.description !== undefined
          ? {
              description:
                changes.description === "" ? null : changes.description,
            }
          : {}),
      }),
    );

  return (
    <SettingsForm
      titleKey="page.settings.profile.title"
      descriptionKey="page.settings.profile.description"
      isDirty={isDirty}
      isSaving={isSaving}
      onSubmit={submit}
      onReset={reset}
    >
      {draft && (
        <>
          <FormSection title={t("settings.profile.identity")}>
            <div className="flex items-center gap-2">
              <span className="text-ink-muted text-sm">
                {t("settings.profile.accountStatus")}
              </span>
              <VerifiedBadge verified={Boolean(user?.verified)} />
            </div>

            <Field
              label={t("settings.profile.name")}
              htmlFor="profile-name"
              error={issues.name}
            >
              <TextInput
                id="profile-name"
                value={draft.name}
                invalid={Boolean(issues.name)}
                onChange={(v) => set("name", v)}
              />
            </Field>

            <Field
              label={t("settings.profile.username")}
              htmlFor="profile-username"
              hint={t("settings.profile.usernameHint")}
              error={issues.username}
            >
              <TextInput
                id="profile-username"
                value={draft.username}
                invalid={Boolean(issues.username)}
                onChange={(v) => set("username", v.toLowerCase())}
              />
            </Field>

            <Field
              label={t("settings.profile.bio")}
              htmlFor="profile-bio"
              error={issues.bio}
            >
              <TextArea
                id="profile-bio"
                value={draft.bio}
                invalid={Boolean(issues.bio)}
                onChange={(v) => set("bio", v)}
              />
            </Field>

            <Field
              label={t("settings.profile.description")}
              htmlFor="profile-description"
              error={issues.description}
            >
              <TextArea
                id="profile-description"
                rows={3}
                value={draft.description}
                invalid={Boolean(issues.description)}
                onChange={(v) => set("description", v)}
              />
            </Field>
          </FormSection>

          <FormSection title={t("settings.profile.visibility")}>
            <Toggle
              id="profile-private"
              label={t("settings.profile.private")}
              description={t("settings.profile.privateHint")}
              checked={draft.private}
              onChange={(v) => set("private", v)}
            />
            <Toggle
              id="profile-hidden"
              label={t("settings.profile.hidden")}
              checked={draft.hidden}
              onChange={(v) => set("hidden", v)}
            />
            <Toggle
              id="profile-seo"
              label={t("settings.profile.seo")}
              checked={draft.allowSEOIndexing}
              onChange={(v) => set("allowSEOIndexing", v)}
            />
            <Toggle
              id="profile-email-visibility"
              label={t("settings.profile.emailVisibility")}
              checked={draft.allowEmailVisibility}
              onChange={(v) => set("allowEmailVisibility", v)}
            />
            <Toggle
              id="profile-phone-visibility"
              label={t("settings.profile.phoneVisibility")}
              checked={draft.allowPhoneNumberVisibility}
              onChange={(v) => set("allowPhoneNumberVisibility", v)}
            />
          </FormSection>

          <FormSection title={t("settings.profile.branding")}>
            <Toggle
              id="profile-custom-brand"
              label={t("settings.profile.customBrand")}
              checked={draft.allowCustomBrandColor}
              onChange={(v) => set("allowCustomBrandColor", v)}
            />
            <Field
              label={t("settings.profile.primaryColor")}
              htmlFor="profile-primary-color"
              hint={t("settings.profile.colorHint")}
              error={issues.primaryBrandColor}
            >
              <TextInput
                id="profile-primary-color"
                value={draft.primaryBrandColor}
                placeholder="#4f46e5"
                disabled={!draft.allowCustomBrandColor}
                invalid={Boolean(issues.primaryBrandColor)}
                onChange={(v) => set("primaryBrandColor", v)}
              />
            </Field>
            <Field
              label={t("settings.profile.secondaryColor")}
              htmlFor="profile-secondary-color"
              error={issues.secondaryBrandColor}
            >
              <TextInput
                id="profile-secondary-color"
                value={draft.secondaryBrandColor}
                placeholder="#0ea5e9"
                disabled={!draft.allowCustomBrandColor}
                invalid={Boolean(issues.secondaryBrandColor)}
                onChange={(v) => set("secondaryBrandColor", v)}
              />
            </Field>
            <Toggle
              id="profile-disable-branding"
              label={t("settings.profile.disableBranding")}
              checked={draft.disableBranding}
              onChange={(v) => set("disableBranding", v)}
            />
          </FormSection>
        </>
      )}
    </SettingsForm>
  );
}

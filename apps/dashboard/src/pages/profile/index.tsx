import { isHexColor, isSingleLine } from "@4mica/rules";
import { Button, Spinner } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  confirmEmailVerification,
  sendEmailVerification,
  updateProfile,
} from "@stores/user/actions";
import {
  selectIsSectionSaving,
  selectUser,
  selectValidationIssues,
} from "@stores/user/selector";
import {
  isUsernameShapeValid,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
} from "@utils/user-rules";
import { hasErrors } from "@utils/validation";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { VerifiedBadge } from "@/components/badges";
import { EditableCard } from "@/components/EditableCard";
import { FieldRow, SwitchCard, TextArea, TextInput } from "@/components/form";
import { SettingsSection, SurfaceCard } from "@/components/layout";
import { SettingsPage } from "@/components/SettingsPage";
import { useDraft } from "@/hooks/useDraft";
import { useUsernameAvailability } from "@/hooks/useUsernameAvailability";
import { notifyError, notifySuccess } from "@/lib/notify";

const TEXT_MAX_LENGTH = 2000;

function useVerificationOutcome() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const outcome = params.get("verify");

  useEffect(() => {
    if (!outcome) {
      return;
    }

    const notifier = outcome === "success" ? notifySuccess : notifyError;

    notifier({
      title: t(`page.settings.profile.verify.${outcome}.title`, {
        defaultValue: "Verification",
      }),
      content: t(`page.settings.profile.verify.${outcome}.body`, {
        defaultValue: "",
      }),
    });

    setParams({}, { replace: true });
  }, [outcome, setParams, t]);
}

function useVerificationToken() {
  const [params, setParams] = useSearchParams();
  const token = params.get("verifyToken");

  const clear = useCallback(
    () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("verifyToken");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return { token, clear };
}

export function ProfileSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const issues = useAppSelector(selectValidationIssues);

  useVerificationOutcome();
  const pendingVerification = useVerificationToken();

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
  const sendingVerification = useAppSelector(
    selectIsSectionSaving("emailVerification"),
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

  const savedUsername = user?.username ?? "";
  const candidate = identity.draft.username.trim().toLowerCase();
  const usernameStatus = useUsernameAvailability(candidate, savedUsername);

  const usernameError = (): string | undefined => {
    if (candidate === savedUsername) {
      return undefined;
    }
    if (candidate === "") {
      return t("validation.required");
    }
    if (!isUsernameShapeValid(candidate)) {
      return t("onboarding.username.invalid");
    }
    if (usernameStatus === "taken") {
      return t("onboarding.username.taken", { username: candidate });
    }
    if (usernameStatus === "reserved") {
      return t("onboarding.username.reserved");
    }
    if (usernameStatus === "blacklisted") {
      return t("onboarding.username.blacklisted");
    }
    return undefined;
  };

  const nameValue = identity.draft.name.trim();
  const identityErrors = {
    name:
      nameValue.length < NAME_MIN_LENGTH
        ? t("validation.minLength", { min: NAME_MIN_LENGTH })
        : nameValue.length > NAME_MAX_LENGTH
          ? t("validation.tooLong", { max: NAME_MAX_LENGTH })
          : !isSingleLine(nameValue)
            ? t("validation.singleLine")
            : undefined,
    username: usernameError(),
    bio:
      identity.draft.bio.trim().length > TEXT_MAX_LENGTH
        ? t("validation.tooLong", { max: TEXT_MAX_LENGTH })
        : undefined,
    description:
      identity.draft.description.trim().length > TEXT_MAX_LENGTH
        ? t("validation.tooLong", { max: TEXT_MAX_LENGTH })
        : undefined,
  };
  const isUsernamePending =
    candidate !== savedUsername && usernameStatus === "checking";

  const colorError = (value: string) =>
    value === "" || isHexColor(value) ? undefined : t("validation.hexColor");
  const colorErrors = {
    primaryBrandColor: colorError(colors.draft.primaryBrandColor),
    secondaryBrandColor: colorError(colors.draft.secondaryBrandColor),
  };

  const toggle = (key: string, value: boolean) =>
    dispatch(updateProfile({ [key]: value }, key));

  const saveIdentity = () =>
    dispatch(
      updateProfile(
        Object.fromEntries(
          Object.entries(identity.changes).map(([k, v]) => {
            const value = typeof v === "string" ? v.trim() : v;
            if (k === "username" && typeof value === "string") {
              return [k, value.toLowerCase()];
            }
            return [k, value === "" && k !== "name" ? null : value];
          }),
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
        {pendingVerification.token ? (
          <SurfaceCard className="flex items-center justify-between gap-4">
            <div>
              <span className="font-medium text-ink-strong text-sm">
                {t("page.settings.profile.verify.confirm.title")}
              </span>
              <p className="mt-0.5 text-ink-muted text-xs">
                {t("page.settings.profile.verify.confirm.body")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                intent="ghost"
                size="sm"
                className="btn-no-lift"
                onClick={pendingVerification.clear}
              >
                {t("page.settings.profile.verify.confirm.dismiss")}
              </Button>
              <Button
                type="button"
                intent="invert"
                size="sm"
                className="btn-no-lift w-32"
                disabled={sendingVerification}
                onClick={() => {
                  dispatch(
                    confirmEmailVerification(
                      pendingVerification.token as string,
                    ),
                  );
                  pendingVerification.clear();
                }}
              >
                <span className="flex w-full items-center justify-center text-sm">
                  {sendingVerification ? (
                    <Spinner size="sm" />
                  ) : (
                    t("page.settings.profile.verify.confirm.action")
                  )}
                </span>
              </Button>
            </div>
          </SurfaceCard>
        ) : null}

        <SurfaceCard className="flex items-center justify-between gap-4">
          <div>
            <span className="font-medium text-ink-strong text-sm">
              {t("settings.profile.accountStatus")}
            </span>
            <p className="mt-0.5 text-ink-muted text-xs">
              {t("settings.profile.accountStatusHint")}
            </p>
          </div>
          {user.emailVerified ? (
            <VerifiedBadge
              verified={user.emailVerified}
              labels={{
                yes: t("settings.verified"),
                no: t("settings.unverified"),
              }}
            />
          ) : (
            <Button
              type="button"
              intent="invert"
              size="sm"
              className="btn-no-lift w-32 shrink-0"
              disabled={sendingVerification}
              aria-label={t("settings.profile.verifyEmail")}
              onClick={() => dispatch(sendEmailVerification())}
            >
              <span className="flex w-full items-center justify-center text-sm">
                {sendingVerification ? (
                  <Spinner size="sm" />
                ) : (
                  t("settings.profile.verifyEmail")
                )}
              </span>
            </Button>
          )}
        </SurfaceCard>

        <EditableCard
          isDirty={identity.isDirty}
          isInvalid={hasErrors(identityErrors) || isUsernamePending}
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
              autoComplete="name"
              value={identity.draft.name}
              error={identityErrors.name ?? issues.name}
              maxLength={NAME_MAX_LENGTH}
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
              autoComplete="username"
              value={identity.draft.username}
              error={identityErrors.username ?? issues.username}
              format="lowercase"
              maxLength={64}
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
              error={identityErrors.bio ?? issues.bio}
              maxLength={TEXT_MAX_LENGTH}
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
              error={identityErrors.description ?? issues.description}
              maxLength={TEXT_MAX_LENGTH}
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
            isInvalid={hasErrors(colorErrors)}
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
                error={
                  colorErrors.primaryBrandColor ?? issues.primaryBrandColor
                }
                maxLength={7}
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
                error={
                  colorErrors.secondaryBrandColor ?? issues.secondaryBrandColor
                }
                maxLength={7}
                onChange={(v) => colors.set("secondaryBrandColor", v)}
              />
            </FieldRow>
          </EditableCard>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}

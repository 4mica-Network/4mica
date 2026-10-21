import { isPhoneNumber, toE164 } from "@4mica/rules";
import { Button, Spinner } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { sendEmailVerification, updateAccount } from "@stores/user/actions";
import {
  selectIsSectionSaving,
  selectValidationIssues,
} from "@stores/user/selector";
import type { User } from "@stores/user/type";
import { hasErrors, isEmail } from "@utils/validation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { VerifiedBadge } from "@/components/badges";
import { EditableCard } from "@/components/EditableCard";
import { FieldRow, TextInput } from "@/components/form";
import { SettingsSection } from "@/components/layout";
import { useDraft } from "@/hooks/useDraft";
import { PhoneVerificationDialog } from "./PhoneVerificationDialog";

export function CredentialsSection({ user }: { user: User }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const issues = useAppSelector(selectValidationIssues);
  const savingContact = useAppSelector(selectIsSectionSaving("contact"));
  const sendingVerification = useAppSelector(
    selectIsSectionSaving("emailVerification"),
  );

  const contactInitial = useMemo(
    () => ({
      email: user.email ?? "",
      phoneNumber: user.phoneNumber ?? "",
    }),
    [user],
  );

  const contact = useDraft(contactInitial);
  const [verifyingPhone, setVerifyingPhone] = useState(false);

  const savedPhone = toE164(user.phoneNumber);
  const phoneEdited =
    contact.draft.phoneNumber.trim() !== (user.phoneNumber ?? "").trim();
  const canVerifyPhone =
    !user.phoneNumberVerified && savedPhone !== null && !phoneEdited;

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

  return (
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
            user.emailVerified || !user.email ? (
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
                className="btn-no-lift w-28 shrink-0"
                disabled={sendingVerification}
                aria-label={t("settings.profile.verifyEmail")}
                onClick={() => dispatch(sendEmailVerification())}
              >
                <span className="flex w-full items-center justify-center text-xs">
                  {sendingVerification ? (
                    <Spinner size="sm" />
                  ) : (
                    t("settings.profile.verifyEmail")
                  )}
                </span>
              </Button>
            )
          }
        >
          <TextInput
            id="account-email"
            inputMode="email"
            autoComplete="email"
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
            canVerifyPhone ? (
              <Button
                type="button"
                intent="invert"
                size="sm"
                className="btn-no-lift w-28 shrink-0"
                onClick={() => setVerifyingPhone(true)}
              >
                <span className="flex w-full items-center justify-center text-xs">
                  {t("settings.account.phoneVerify.action")}
                </span>
              </Button>
            ) : (
              <VerifiedBadge
                verified={user.phoneNumberVerified}
                labels={{
                  yes: t("settings.verified"),
                  no: t("settings.unverified"),
                }}
              />
            )
          }
        >
          <TextInput
            id="account-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={contact.draft.phoneNumber}
            placeholder="+1 555 000 1234"
            error={contactErrors.phoneNumber ?? issues.phoneNumber}
            maxLength={20}
            onChange={(v) => contact.set("phoneNumber", v)}
          />
          {user.phoneNumber && !savedPhone && !phoneEdited && (
            <p className="mt-2 text-ink-muted text-xs">
              {t("settings.account.phoneVerify.needsCountryCode")}
            </p>
          )}
        </FieldRow>
      </EditableCard>

      {savedPhone && verifyingPhone && (
        <PhoneVerificationDialog
          phoneNumber={savedPhone}
          isOpen
          onClose={() => setVerifyingPhone(false)}
        />
      )}
    </SettingsSection>
  );
}

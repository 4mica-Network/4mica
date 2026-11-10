import { toE164 } from "@4mica/rules";
import { Button, Modal } from "@4mica/ui";
import { useUser } from "@clerk/clerk-react";
import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { syncPhoneVerification } from "@stores/user/actions";
import { selectIsSectionSaving, selectUser } from "@stores/user/selector";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, TextInput } from "@/components/form";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>;
type ClerkPhoneNumber = ClerkUser["phoneNumbers"][number];

const clerkMessage = (error: unknown, fallback: string): string => {
  if (!isClerkAPIResponseError(error)) {
    return fallback;
  }
  const [first] = error.errors;
  return first?.longMessage ?? first?.message ?? fallback;
};

export function PhoneVerificationDialog({
  phoneNumber,
  isOpen,
  onClose,
}: {
  phoneNumber: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { user } = useUser();
  const syncing = useAppSelector(selectIsSectionSaving("phoneVerification"));
  const verified = useAppSelector(selectUser)?.phoneNumberVerified ?? false;
  const formId = useId();
  const pending = useRef<ClerkPhoneNumber | null>(null);

  const [step, setStep] = useState<"send" | "code">("send");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (isOpen && verified) {
      onClose();
    }
  }, [isOpen, verified, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setStep("send");
      setCode("");
      setError(null);
      setCooldown(0);
      pending.current = null;
    }
  }, [isOpen]);

  const sendCode = async () => {
    if (!user) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const existing = user.phoneNumbers.find(
        (phone) => toE164(phone.phoneNumber) === phoneNumber,
      );
      if (existing?.verification.status === "verified") {
        dispatch(syncPhoneVerification());
        return;
      }
      const phone = existing ?? (await user.createPhoneNumber({ phoneNumber }));
      await phone.prepareVerification();
      pending.current = phone;
      setStep("code");
      setCode("");
      setCooldown(RESEND_SECONDS);
    } catch (caught) {
      setError(
        clerkMessage(caught, t("settings.account.phoneVerify.sendFailed")),
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!pending.current || code.length !== CODE_LENGTH) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await pending.current.attemptVerification({ code });
      if (result.verification.status === "verified") {
        await user?.reload();
        dispatch(syncPhoneVerification());
      } else {
        setError(t("settings.account.phoneVerify.codeRejected"));
      }
    } catch (caught) {
      setError(
        clerkMessage(caught, t("settings.account.phoneVerify.codeRejected")),
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || syncing) {
      return;
    }
    void (step === "send" ? sendCode() : verify());
  };

  const working = busy || syncing;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      disableOverlayClose={working}
      title={t("settings.account.phoneVerify.title")}
      description={
        step === "send"
          ? t("settings.account.phoneVerify.sendLead", { phone: phoneNumber })
          : t("settings.account.phoneVerify.codeLead", { phone: phoneNumber })
      }
      data-testid="phone-verification"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className="btn-no-lift"
            disabled={working}
            onClick={onClose}
          >
            {t("settings.account.phoneVerify.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            intent="invert"
            size="sm"
            className="btn-no-lift min-w-28 text-sm"
            loading={working}
            disabled={step === "code" && code.length !== CODE_LENGTH}
          >
            {step === "send"
              ? t("settings.account.phoneVerify.send")
              : t("settings.account.phoneVerify.verify")}
          </Button>
        </div>
      }
    >
      <form id={formId} noValidate onSubmit={submit}>
        {step === "code" && (
          <FieldRow
            title={t("settings.account.phoneVerify.code")}
            htmlFor="phone-verification-code"
          >
            <TextInput
              id="phone-verification-code"
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={CODE_LENGTH}
              placeholder="123456"
              value={code}
              onChange={(value) =>
                setCode(value.replace(/\D/g, "").slice(0, CODE_LENGTH))
              }
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="text-ink-muted text-xs transition-colors hover:text-ink-strong disabled:opacity-50 disabled:hover:text-ink-muted"
                disabled={cooldown > 0 || working}
                onClick={() => void sendCode()}
              >
                {cooldown > 0
                  ? t("settings.account.phoneVerify.resendIn", {
                      seconds: cooldown,
                    })
                  : t("settings.account.phoneVerify.resend")}
              </button>
            </div>
          </FieldRow>
        )}

        {error && (
          <p role="alert" className="mt-2 text-danger text-xs">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

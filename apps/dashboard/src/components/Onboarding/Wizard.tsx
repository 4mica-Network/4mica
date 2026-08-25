import { Button, Modal, Spinner } from "@4mica/ui";
import { useClerk } from "@clerk/clerk-react";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { completeOnboarding, updateProfile } from "@stores/user/actions";
import {
  selectBusiness,
  selectIsSectionSaving,
  selectUser,
  selectUsernameCheck,
  selectValidationIssues,
} from "@stores/user/selector";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { blankToNull } from "@/components/form";
import { type BusinessDraft, BusinessStep } from "./BusinessStep";
import { NameStep } from "./NameStep";
import { StepIndicator } from "./StepIndicator";
import { UsernameStep } from "./UsernameStep";
import { isBusinessValid, isNameValid, isUsernameValid } from "./validation";

const STEPS = ["name", "username", "business"] as const;

const SECTIONS = {
  name: "onboarding.name",
  username: "onboarding.username",
  business: "onboarding.business",
} as const;

export function Wizard() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { signOut } = useClerk();

  const user = useAppSelector(selectUser);
  const business = useAppSelector(selectBusiness);
  const issues = useAppSelector(selectValidationIssues);
  const usernameCheck = useAppSelector(selectUsernameCheck);
  const error = useAppSelector((state) => state.user.error);

  const [step, setStep] = useState(0);

  // Plain useState, NOT useDraft: the user slice applies writes optimistically,
  // so useDraft's resync-on-`initial`-change would wipe what is being typed the
  // moment a step's PATCH lands.
  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [businessDraft, setBusinessDraft] = useState<BusinessDraft>({
    legalName: business?.legalName ?? "",
    businessType: business?.businessType ?? "",
    country: business?.country ?? "",
  });

  /** The section whose write we are waiting on, or null when idle. */
  const [pending, setPending] = useState<string | null>(null);
  const isSaving = useAppSelector(selectIsSectionSaving(pending ?? ""));

  // "not saving" only means "finished" once we have actually seen it saving.
  // Without this, a render where `pending` is set but the dispatch has not yet
  // been reflected in `savingSections` reads as a completed write and skips the
  // step forward before anything was sent.
  const sawSaving = useRef(false);

  // Advance only once the write has landed cleanly.
  //
  // Relies on exactly one write being in flight at a time, which a blocking
  // modal with a single Continue button guarantees. If a "save and skip"
  // affordance is ever added, this needs a request id in `meta` instead.
  useEffect(() => {
    if (!pending) {
      return;
    }
    if (isSaving) {
      sawSaving.current = true;
      return;
    }
    if (!sawSaving.current) {
      return;
    }

    sawSaving.current = false;
    setPending(null);
    if (!error && Object.keys(issues).length === 0) {
      setStep((current) => current + 1);
    }
  }, [pending, isSaving, error, issues]);

  if (!user) {
    return null;
  }

  const savedUsername = user.username ?? "";

  const canContinue = (() => {
    switch (STEPS[step]) {
      case "name":
        return isNameValid(name);
      case "username":
        return isUsernameValid(username, usernameCheck.status);
      case "business":
        return isBusinessValid(businessDraft.legalName);
      default:
        return false;
    }
  })();

  const submit = () => {
    if (!canContinue || pending) {
      return;
    }

    switch (STEPS[step]) {
      case "name":
        setPending(SECTIONS.name);
        dispatch(updateProfile({ name: name.trim() }, SECTIONS.name));
        break;

      case "username":
        // Unchanged handle: nothing to write, just move on.
        if (username.trim().toLowerCase() === savedUsername) {
          setStep((current) => current + 1);
          return;
        }
        setPending(SECTIONS.username);
        dispatch(
          updateProfile(
            { username: username.trim().toLowerCase() },
            SECTIONS.username,
          ),
        );
        break;

      case "business":
        setPending(SECTIONS.business);
        dispatch(
          completeOnboarding(
            blankToNull(
              {
                legalName: businessDraft.legalName.trim(),
                businessType: businessDraft.businessType,
                country: businessDraft.country,
              },
              ["legalName"],
            ),
            SECTIONS.business,
          ),
        );
        break;
    }
  };

  const isLastStep = step === STEPS.length - 1;

  return (
    <Modal
      isOpen
      onClose={() => {}}
      title={t("onboarding.title")}
      description={t("onboarding.description")}
      size="md"
      showClose={false}
      disableOverlayClose
      disableEscapeClose
      data-testid="onboarding"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {/*
            Not an escape from onboarding — an escape from a broken one. Without
            it a failing API strands the user in a modal with no way to even
            sign out.
          */}
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-md text-ink-subtle text-xs transition-colors hover:text-ink-body"
          >
            {t("onboarding.signOut")}
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                intent="ghost"
                size="sm"
                disabled={Boolean(pending)}
                onClick={() => setStep((current) => current - 1)}
              >
                {t("onboarding.back")}
              </Button>
            )}

            <Button
              intent="invert"
              size="sm"
              className="btn-no-lift min-w-24"
              disabled={!canContinue || Boolean(pending)}
              onClick={submit}
            >
              <span className="flex w-full items-center justify-center text-sm">
                {pending ? (
                  <Spinner size="sm" />
                ) : isLastStep ? (
                  t("onboarding.finish")
                ) : (
                  t("onboarding.continue")
                )}
              </span>
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <StepIndicator current={step} total={STEPS.length} />

        {STEPS[step] === "name" && (
          <NameStep value={name} onChange={setName} error={issues.name} />
        )}

        {STEPS[step] === "username" && (
          <UsernameStep
            value={username}
            onChange={setUsername}
            savedUsername={savedUsername}
            error={issues.username}
          />
        )}

        {STEPS[step] === "business" && (
          <BusinessStep
            draft={businessDraft}
            issues={issues}
            onChange={(key, value) =>
              setBusinessDraft((current) => ({ ...current, [key]: value }))
            }
          />
        )}

        {error && (
          <p className="text-danger text-xs" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

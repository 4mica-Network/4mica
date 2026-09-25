import { Button, Modal, Spinner } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAgent } from "@stores/agent/actions";
import {
  selectAgentError,
  selectAgentIssues,
  selectIsAgentPending,
} from "@stores/agent/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchActiveWallets } from "@stores/wallet/actions";
import {
  selectPayerWallets,
  selectSellerWallets,
} from "@stores/wallet/selector";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { StepIndicator } from "@/components/Onboarding/StepIndicator";
import { links } from "@/lib/links";
import { AgentFormFields } from "./AgentFormFields";
import {
  type AgentValues,
  agentSchema,
  blankToNull,
  CREATE_STEP_FIELDS,
} from "./validation";

const PENDING_KEY = "createAgent";
const TOTAL_STEPS = CREATE_STEP_FIELDS.length;

export function CreateAgentModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(selectIsAgentPending(PENDING_KEY));
  const error = useAppSelector(selectAgentError);
  const issues = useAppSelector(selectAgentIssues);
  const sellerWallets = useAppSelector(selectSellerWallets);
  const payerWallets = useAppSelector(selectPayerWallets);

  const [step, setStep] = useState(0);

  const {
    handleSubmit,
    setValue,
    watch,
    trigger,
    reset,
    formState: { errors },
  } = useForm<AgentValues>({
    resolver: zodResolver(agentSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      slug: "",
      headline: "",
      description: "",
      network: "BASE_SEPOLIA",
      status: "PENDING",
      visibility: "PRIVATE",
      payerWalletId: "",
      creditLimit: "",
      walletId: "",
      assetAddress: "",
      priceAmount: "",
      priceCurrency: "USD",
      priceLabel: "",
      endpointUrl: "",
      x402Endpoint: "",
      docsUrl: "",
      avatarUrl: "",
    },
  });

  const values = watch();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    reset();
    setStep(0);
    dispatch(fetchActiveWallets());
  }, [isOpen, reset, dispatch]);

  const eligibleSellers = sellerWallets.filter(
    (wallet) => wallet.network === values.network,
  );
  const eligiblePayers = payerWallets.filter(
    (wallet) => wallet.network === values.network,
  );

  const continueToNext = async () => {
    const valid = await trigger([...CREATE_STEP_FIELDS[step]]);
    if (!valid) {
      return;
    }
    setStep((current) => current + 1);
  };

  const onValid = (data: AgentValues) => {
    dispatch(
      createAgent({
        name: data.name.trim(),
        ...(blankToNull(data.slug) ? { slug: data.slug as string } : {}),
        headline: blankToNull(data.headline),
        description: blankToNull(data.description),
        avatarUrl: blankToNull(data.avatarUrl),
        docsUrl: blankToNull(data.docsUrl),
        status: data.status,
        visibility: data.visibility,
        network: data.network,

        payerWalletId: blankToNull(data.payerWalletId),
        creditLimit: data.creditLimit?.trim() || "0",

        walletId: blankToNull(data.walletId),
        assetAddress: blankToNull(data.assetAddress),
        priceAmount: blankToNull(data.priceAmount),
        priceCurrency: blankToNull(data.priceCurrency),
        priceLabel: blankToNull(data.priceLabel),
        endpointUrl: blankToNull(data.endpointUrl),
        x402Endpoint: blankToNull(data.x402Endpoint),
      }),
    );
  };

  const onInvalid = (invalid: Record<string, unknown>) => {
    const firstBadStep = CREATE_STEP_FIELDS.findIndex((fields) =>
      fields.some((field) => field in invalid),
    );
    if (firstBadStep >= 0 && firstBadStep !== step) {
      setStep(firstBadStep);
    }
  };

  const sawSaving = useRef(false);
  useEffect(() => {
    if (isSaving) {
      sawSaving.current = true;
      return;
    }
    if (!sawSaving.current) {
      return;
    }
    sawSaving.current = false;
    if (!error && Object.keys(issues).length === 0) {
      onClose();
    }
  }, [isSaving, error, issues, onClose]);

  const fieldError = (field: keyof AgentValues) => {
    if (issues[field]) {
      return issues[field];
    }
    const message = errors[field]?.message;
    return message ? t(message) : undefined;
  };

  const isLastStep = step === TOTAL_STEPS - 1;
  const canSubmit = Boolean(values.name?.trim()) && !isSaving;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("agent.create.title")}
      description={t("agent.create.description")}
      size="lg"
      disableOverlayClose
      data-testid="create-agent"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <a
            href={links.docs}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 rounded-md text-ink-subtle text-xs transition-colors hover:text-ink-body"
          >
            {t("agent.create.learnMore")}
            <ArrowUpRight className="h-3 w-3" />
          </a>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                intent="ghost"
                size="sm"
                disabled={isSaving}
                onClick={() => setStep((current) => current - 1)}
              >
                {t("agent.create.back")}
              </Button>
            )}

            {isLastStep ? (
              <Button
                intent="invert"
                size="sm"
                className="btn-no-lift min-w-32"
                disabled={!canSubmit}
                onClick={handleSubmit(onValid, onInvalid)}
                data-testid="create-agent-submit"
              >
                <span className="flex w-full items-center justify-center text-sm">
                  {isSaving ? <Spinner size="sm" /> : t("agent.create.finish")}
                </span>
              </Button>
            ) : (
              <Button
                intent="invert"
                size="sm"
                className="btn-no-lift min-w-32"
                onClick={continueToNext}
                data-testid="create-agent-continue"
              >
                <span className="flex w-full items-center justify-center text-sm">
                  {t("agent.create.continue")}
                </span>
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <StepIndicator current={step} total={TOTAL_STEPS} />

        <AgentFormFields
          t={t}
          values={values}
          setValue={setValue}
          fieldError={fieldError}
          wallets={eligibleSellers}
          payerWallets={eligiblePayers}
          idPrefix="create-agent"
          step={step}
        />

        {error && <p className="text-danger text-sm">{error}</p>}
      </div>
    </Modal>
  );
}

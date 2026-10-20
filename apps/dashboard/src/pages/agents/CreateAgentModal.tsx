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
import { blankToNull } from "@utils/format";
import { ArrowUpRight } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Form } from "@/components/form";
import { StepIndicator } from "@/components/Onboarding/StepIndicator";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { useServerIssues } from "@/hooks/useServerIssues";
import { firstStepWith, useStepWithIssue } from "@/hooks/useStepWithIssue";
import { links } from "@/lib/links";
import { AgentFormFields } from "./AgentFormFields";
import {
  type AgentValues,
  agentSchema,
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
  useStepWithIssue(issues, CREATE_STEP_FIELDS, setStep);

  const form = useForm<AgentValues>({
    resolver: zodResolver(agentSchema),
    mode: "onTouched",
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

  const { handleSubmit, trigger, reset, setError, control } = form;
  const [name, network] = useWatch({ control, name: ["name", "network"] });
  const formId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    reset();
    setStep(0);
    dispatch(fetchActiveWallets());
  }, [isOpen, reset, dispatch]);

  useServerIssues(issues, setError);

  const eligibleSellers = sellerWallets.filter(
    (wallet) => wallet.network === network,
  );
  const eligiblePayers = payerWallets.filter(
    (wallet) => wallet.network === network,
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
    const firstBadStep = firstStepWith(
      CREATE_STEP_FIELDS,
      Object.keys(invalid),
    );
    if (firstBadStep >= 0 && firstBadStep !== step) {
      setStep(firstBadStep);
    }
  };

  useOnSuccess(
    isSaving,
    Boolean(error) || Object.keys(issues).length > 0,
    onClose,
  );

  const isLastStep = step === TOTAL_STEPS - 1;
  const canSubmit = Boolean(name?.trim()) && !isSaving;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (isLastStep) {
      handleSubmit(onValid, onInvalid)(event);
      return;
    }
    event.preventDefault();
    void continueToNext();
  };

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
                type="submit"
                form={formId}
                disabled={!canSubmit}
                aria-busy={isSaving}
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
                type="submit"
                form={formId}
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

        <Form form={form} id={formId} onSubmit={onSubmit}>
          <AgentFormFields
            wallets={eligibleSellers}
            payerWallets={eligiblePayers}
            idPrefix="create-agent"
            step={step}
          />
        </Form>

        {error && (
          <p className="text-danger text-sm" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

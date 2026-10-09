import { slugify } from "@4mica/rules";
import { Button, Modal, Spinner } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { createApiListing } from "@stores/apiListing/actions";
import {
  selectApiListingError,
  selectApiListingIssues,
  selectIsApiListingPending,
} from "@stores/apiListing/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchActiveWallets } from "@stores/wallet/actions";
import { selectSellerWallets } from "@stores/wallet/selector";
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
import { ApiListingFormFields } from "./ApiListingFormFields";
import {
  type ApiListingValues,
  CREATE_STEP_FIELDS,
  createApiListingSchema,
} from "./validation";

const PENDING_KEY = "createApiListing";
const TOTAL_STEPS = CREATE_STEP_FIELDS.length;

export function CreateApiListingModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(selectIsApiListingPending(PENDING_KEY));
  const error = useAppSelector(selectApiListingError);
  const issues = useAppSelector(selectApiListingIssues);
  const wallets = useAppSelector(selectSellerWallets);

  const [step, setStep] = useState(0);
  useStepWithIssue(issues, CREATE_STEP_FIELDS, setStep);

  const form = useForm<ApiListingValues>({
    resolver: zodResolver(createApiListingSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      slug: "",
      summary: "",
      description: "",
      walletId: "",
      assetAddress: "",
      priceAmount: "",
      priceCurrency: "USD",
      priceLabel: "",
      url: "",
      method: "GET" as const,
      docsUrl: "",
      x402Endpoint: "",
      category: "",
      tags: [],
      visibility: "PRIVATE",
    },
  });

  const {
    handleSubmit,
    trigger,
    reset,
    setError,
    setValue,
    getFieldState,
    control,
  } = form;
  const name = useWatch({ control, name: "name" });
  const formId = useId();

  useEffect(() => {
    if (!getFieldState("slug").isDirty) {
      setValue("slug", slugify(name));
    }
  }, [name, getFieldState, setValue]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    reset();
    setStep(0);
    dispatch(fetchActiveWallets());
  }, [isOpen, reset, dispatch]);

  useServerIssues(issues, setError);

  const continueToNext = async () => {
    const valid = await trigger([...CREATE_STEP_FIELDS[step]]);
    if (!valid) {
      return;
    }
    setStep((current) => current + 1);
  };

  const onValid = (data: ApiListingValues) => {
    dispatch(
      createApiListing({
        name: data.name.trim(),
        ...(blankToNull(data.slug) ? { slug: data.slug as string } : {}),
        summary: blankToNull(data.summary),
        description: blankToNull(data.description),
        url: blankToNull(data.url),
        method: data.method,
        docsUrl: blankToNull(data.docsUrl),
        x402Endpoint: blankToNull(data.x402Endpoint),
        category: blankToNull(data.category),
        tags: data.tags,
        visibility: data.visibility,
        walletId: blankToNull(data.walletId),
        assetAddress: blankToNull(data.assetAddress),
        priceAmount: blankToNull(data.priceAmount),
        priceCurrency: blankToNull(data.priceCurrency),
        priceLabel: blankToNull(data.priceLabel),
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
      title={t("apiListing.create.title")}
      description={t("apiListing.create.description")}
      size="lg"
      disableOverlayClose
      data-testid="create-api-listing"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <a
            href={links.docs}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 rounded-md text-ink-subtle text-xs transition-colors hover:text-ink-body"
          >
            {t("apiListing.create.learnMore")}
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
                {t("apiListing.create.back")}
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
                data-testid="create-api-listing-submit"
              >
                <span className="flex w-full items-center justify-center text-sm">
                  {isSaving ? (
                    <Spinner size="sm" />
                  ) : (
                    t("apiListing.create.finish")
                  )}
                </span>
              </Button>
            ) : (
              <Button
                intent="invert"
                size="sm"
                className="btn-no-lift min-w-32"
                type="submit"
                form={formId}
                data-testid="create-api-listing-continue"
              >
                <span className="flex w-full items-center justify-center text-sm">
                  {t("apiListing.create.continue")}
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
          <ApiListingFormFields step={step} wallets={wallets} />
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

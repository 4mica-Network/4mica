import { Button, Modal, Spinner } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { createCustomer } from "@stores/customer/actions";
import {
  selectCustomerError,
  selectCustomerIssues,
  selectIsCustomerPending,
} from "@stores/customer/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { blankToNull } from "@utils/format";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Form } from "@/components/form";
import { StepIndicator } from "@/components/Onboarding/StepIndicator";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { useServerIssues } from "@/hooks/useServerIssues";
import { firstStepWith, useStepWithIssue } from "@/hooks/useStepWithIssue";
import { CustomerFormFields } from "./CustomerFormFields";
import {
  CREATE_STEP_FIELDS,
  type CustomerValues,
  createCustomerSchema,
} from "./validation";

const PENDING_KEY = "createCustomer";
const TOTAL_STEPS = CREATE_STEP_FIELDS.length;
const ISSUE_STEPS: Record<string, number> = { identities: 1 };

export function CreateCustomerModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(selectIsCustomerPending(PENDING_KEY));
  const error = useAppSelector(selectCustomerError);
  const issues = useAppSelector(selectCustomerIssues);

  const [step, setStep] = useState(0);
  useStepWithIssue(issues, CREATE_STEP_FIELDS, setStep, ISSUE_STEPS);

  const form = useForm<CustomerValues>({
    resolver: zodResolver(createCustomerSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      email: "",
      type: "ORGANIZATION",
      description: "",
      notes: "",
      network: "",
      address: "",
      dailyLimit: "",
      monthlyLimit: "",
      limitCurrency: "USD",
    },
  });

  const { handleSubmit, trigger, reset, setError, control } = form;
  const name = useWatch({ control, name: "name" });
  const formId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    reset();
    setStep(0);
  }, [isOpen, reset]);

  useServerIssues(issues, setError);

  const continueToNext = async () => {
    const valid = await trigger([...CREATE_STEP_FIELDS[step]]);
    if (!valid) {
      return;
    }
    setStep((current) => current + 1);
  };

  const onValid = (data: CustomerValues) => {
    const address = blankToNull(data.address);
    const network = blankToNull(data.network);

    dispatch(
      createCustomer({
        name: data.name.trim(),
        email: blankToNull(data.email),
        type: data.type,
        description: blankToNull(data.description),
        notes: blankToNull(data.notes),
        dailyLimit: blankToNull(data.dailyLimit),
        monthlyLimit: blankToNull(data.monthlyLimit),
        ...(blankToNull(data.limitCurrency)
          ? { limitCurrency: data.limitCurrency as string }
          : {}),
        identities:
          address && network
            ? [
                {
                  type: "WALLET" as const,
                  network: network as never,
                  address,
                  source: "MANUAL" as const,
                },
              ]
            : [],
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
      title={t("customer.create.title")}
      description={t("customer.create.description")}
      size="lg"
      disableOverlayClose
      data-testid="create-customer"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <StepIndicator current={step} total={TOTAL_STEPS} />

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                intent="ghost"
                size="sm"
                className="btn-no-lift"
                disabled={isSaving}
                onClick={() => setStep((current) => current - 1)}
                data-testid="create-customer-back"
              >
                {t("customer.create.back")}
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
                data-testid="create-customer-submit"
              >
                <span className="flex w-full items-center justify-center text-sm">
                  {isSaving ? <Spinner size="sm" /> : t("customer.create.save")}
                </span>
              </Button>
            ) : (
              <Button
                intent="invert"
                size="sm"
                className="btn-no-lift min-w-32"
                type="submit"
                form={formId}
                data-testid="create-customer-next"
              >
                {t("customer.create.next")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <Form form={form} id={formId} onSubmit={onSubmit}>
        <CustomerFormFields idPrefix="create-customer" step={step} />
      </Form>

      {error && (
        <p className="mt-3 text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

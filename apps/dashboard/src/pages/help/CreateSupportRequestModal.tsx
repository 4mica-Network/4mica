import { Button, Modal } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  clearSupportIssues,
  createSupportRequest,
  supportPendingKeys,
} from "@stores/support/actions";
import {
  selectIsSupportPending,
  selectSupportError,
  selectSupportIssues,
} from "@stores/support/selector";
import type { SupportCategory } from "@stores/support/type";
import { blankToNull } from "@utils/format";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Form } from "@/components/form";
import { StepIndicator } from "@/components/Onboarding/StepIndicator";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { useServerIssues } from "@/hooks/useServerIssues";
import { firstStepWith, useStepWithIssue } from "@/hooks/useStepWithIssue";
import { CategoryPicker } from "./CategoryPicker";
import { categoryGuide, categoryLabelKey } from "./constants";
import { SupportRequestFormFields } from "./SupportRequestFormFields";
import {
  CREATE_STEP_FIELDS,
  type SupportRequestValues,
  supportRequestSchema,
} from "./validation";

const TOTAL_STEPS = CREATE_STEP_FIELDS.length;

export function CreateSupportRequestModal({
  isOpen,
  initialCategory,
  onClose,
}: {
  isOpen: boolean;
  initialCategory?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(
    selectIsSupportPending(supportPendingKeys.create),
  );
  const error = useAppSelector(selectSupportError);
  const issues = useAppSelector(selectSupportIssues);

  const [step, setStep] = useState(0);
  useStepWithIssue(issues, CREATE_STEP_FIELDS, setStep);

  const form = useForm<SupportRequestValues>({
    resolver: zodResolver(supportRequestSchema),
    mode: "onTouched",
    defaultValues: {
      category: "",
      subject: "",
      priority: "NORMAL",
      description: "",
      reference: "",
    },
  });

  const { handleSubmit, trigger, reset, setError, control } = form;
  const [category, subject, description] = useWatch({
    control,
    name: ["category", "subject", "description"],
  });
  const formId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    reset({
      category: initialCategory ?? "",
      subject: "",
      priority: "NORMAL",
      description: "",
      reference: "",
    });
    setStep(initialCategory ? 1 : 0);
    dispatch(clearSupportIssues());
  }, [isOpen, initialCategory, reset, dispatch]);

  useServerIssues(issues, setError);

  const continueToNext = async () => {
    const valid = await trigger([...CREATE_STEP_FIELDS[step]]);
    if (!valid) {
      return;
    }
    setStep((current) => current + 1);
  };

  const onValid = (data: SupportRequestValues) => {
    dispatch(
      createSupportRequest({
        category: data.category as SupportCategory,
        subject: data.subject.trim(),
        priority: data.priority,
        description: data.description.trim(),
        reference: blankToNull(data.reference),
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
  const hasCategory = Boolean(category);
  const canSubmit =
    Boolean(subject?.trim()) && Boolean(description?.trim()) && !isSaving;

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
      title={t("help.create.title")}
      description={t("help.create.description")}
      size="lg"
      disableOverlayClose
      data-testid="create-support-request"
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
                data-testid="create-support-request-back"
              >
                {t("help.create.back")}
              </Button>
            )}

            {isLastStep ? (
              <Button
                intent="invert"
                size="sm"
                className="btn-no-lift min-w-32 text-sm"
                loading={isSaving}
                type="submit"
                form={formId}
                disabled={!canSubmit}
                data-testid="create-support-request-submit"
              >
                {t("help.create.submit")}
              </Button>
            ) : (
              <Button
                intent="invert"
                size="sm"
                className="btn-no-lift min-w-32 text-sm"
                type="submit"
                form={formId}
                disabled={!hasCategory}
                data-testid="create-support-request-next"
              >
                {t("help.create.next")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <Form form={form} id={formId} onSubmit={onSubmit}>
        {step === 0 ? (
          <CategoryPicker />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-overlay/10 bg-overlay/5 px-4 py-3">
              <BookOpen
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle"
              />
              <div className="min-w-0">
                <p className="text-ink-body text-sm">
                  {t("help.create.guideTitle", {
                    category: t(categoryLabelKey(category)),
                  })}
                </p>
                <a
                  href={categoryGuide(category)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-0.5 inline-flex items-center gap-1 text-ink-subtle text-xs transition-colors hover:text-ink-body"
                  data-testid="create-support-request-guide"
                >
                  {t("help.create.guideLink")}
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
            </div>

            <SupportRequestFormFields idPrefix="create-support-request" />
          </div>
        )}
      </Form>

      {error && (
        <p className="mt-3 text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

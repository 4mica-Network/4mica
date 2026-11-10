import { Button, Modal } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  clearSupportIssues,
  supportPendingKeys,
  updateSupportRequest,
} from "@stores/support/actions";
import {
  selectIsSupportPending,
  selectSupportError,
  selectSupportIssues,
} from "@stores/support/selector";
import type { SupportCategory, SupportRequest } from "@stores/support/type";
import { blankToNull } from "@utils/format";
import { useEffect, useId } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Form } from "@/components/form";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { useServerIssues } from "@/hooks/useServerIssues";
import { SupportRequestFormFields } from "./SupportRequestFormFields";
import { type SupportRequestValues, supportRequestSchema } from "./validation";

export function EditSupportRequestModal({
  request,
  onClose,
}: {
  request: SupportRequest | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(
    selectIsSupportPending(supportPendingKeys.row(request?.id ?? "")),
  );
  const error = useAppSelector(selectSupportError);
  const issues = useAppSelector(selectSupportIssues);

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

  const { handleSubmit, reset, setError, control } = form;
  const subject = useWatch({ control, name: "subject" });
  const formId = useId();

  useEffect(() => {
    if (request) {
      reset({
        category: request.category,
        subject: request.subject,
        priority: request.priority,
        description: request.description,
        reference: request.reference ?? "",
      });
      dispatch(clearSupportIssues());
    }
  }, [request, reset, dispatch]);

  useServerIssues(issues, setError);

  useOnSuccess(
    isSaving,
    Boolean(error) || Object.keys(issues).length > 0,
    onClose,
  );

  const onValid = (data: SupportRequestValues) => {
    if (!request) {
      return;
    }
    dispatch(
      updateSupportRequest({
        id: request.id,
        data: {
          subject: data.subject.trim(),
          category: data.category as SupportCategory,
          priority: data.priority,
          reference: blankToNull(data.reference),
        },
      }),
    );
  };

  return (
    <Modal
      isOpen={Boolean(request)}
      onClose={onClose}
      title={t("help.edit.title")}
      description={t("help.edit.description")}
      size="lg"
      data-testid="edit-support-request"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            intent="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("help.edit.cancel")}
          </Button>
          <Button
            intent="invert"
            size="sm"
            className="btn-no-lift min-w-24 text-sm"
            loading={isSaving}
            type="submit"
            form={formId}
            disabled={!subject?.trim()}
            data-testid="edit-support-request-submit"
          >
            {t("help.edit.save")}
          </Button>
        </div>
      }
    >
      <Form form={form} id={formId} onSubmit={handleSubmit(onValid)}>
        <SupportRequestFormFields
          idPrefix="edit-support-request"
          showCategory
          showDescription={false}
        />
      </Form>
    </Modal>
  );
}

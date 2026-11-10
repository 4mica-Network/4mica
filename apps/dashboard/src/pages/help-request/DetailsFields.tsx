import { Button, Spinner } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  supportPendingKeys,
  updateSupportRequest,
} from "@stores/support/actions";
import {
  selectIsSupportPending,
  selectSupportError,
  selectSupportIssues,
} from "@stores/support/selector";
import type {
  SupportCategory,
  SupportRequestDetail,
} from "@stores/support/type";
import { blankToNull } from "@utils/format";
import { Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Form } from "@/components/form";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { useServerIssues } from "@/hooks/useServerIssues";
import { categoryLabelKey, PRIORITY_LABEL_KEYS } from "@/pages/help/constants";
import { SupportRequestFormFields } from "@/pages/help/SupportRequestFormFields";
import {
  type SupportRequestValues,
  supportRequestSchema,
} from "@/pages/help/validation";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-ink-muted text-xs">{label}</dt>
      <dd className="m-0 truncate text-ink-body text-sm" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function DetailsFields({ request }: { request: SupportRequestDetail }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(
    selectIsSupportPending(supportPendingKeys.row(request.id)),
  );
  const error = useAppSelector(selectSupportError);
  const issues = useAppSelector(selectSupportIssues);

  const [editing, setEditing] = useState(false);

  const { category, subject, priority, description, reference } = request;
  const defaults = useMemo<SupportRequestValues>(
    () => ({
      category,
      subject,
      priority,
      description,
      reference: reference ?? "",
    }),
    [category, subject, priority, description, reference],
  );

  const form = useForm<SupportRequestValues>({
    resolver: zodResolver(supportRequestSchema),
    mode: "onTouched",
    values: defaults,
  });
  const {
    handleSubmit,
    reset,
    setError,
    formState: { isDirty },
  } = form;
  useServerIssues(issues, setError);

  useOnSuccess(isSaving, error !== null, () => setEditing(false));

  const isClosed = request.status === "CLOSED";

  const cancel = () => {
    reset(defaults);
    setEditing(false);
  };

  const onValid = (data: SupportRequestValues) => {
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

  if (editing && !isClosed) {
    return (
      <Form
        form={form}
        className="rounded-lg border border-overlay/10 px-4 py-4"
        onSubmit={handleSubmit(onValid)}
      >
        <div data-testid="support-details-form">
          <SupportRequestFormFields
            idPrefix="support-detail"
            showCategory
            showDescription={false}
          />
        </div>

        <div className="-mx-4 mt-4 flex items-center justify-end gap-2 border-overlay/10 border-t px-4 pt-4">
          <Button
            type="button"
            intent="ghost"
            size="sm"
            disabled={isSaving}
            onClick={cancel}
            data-testid="support-details-cancel"
          >
            {t("help.edit.cancel")}
          </Button>
          <Button
            type="submit"
            intent="invert"
            size="sm"
            className="btn-no-lift w-20 text-sm"
            loading={isSaving}
            disabled={!isDirty}
            data-testid="support-details-save"
          >
            {t("settings.update")}
          </Button>
        </div>
      </Form>
    );
  }

  return (
    <div
      className="flex items-start justify-between gap-4"
      data-testid="support-details"
    >
      <dl className="m-0 grid min-w-0 flex-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Detail label={t("help.fields.subject.label")} value={subject} />
        </div>
        <Detail
          label={t("help.fields.category.label")}
          value={t(categoryLabelKey(category))}
        />
        <Detail
          label={t("help.fields.priority.label")}
          value={t(PRIORITY_LABEL_KEYS[priority])}
        />
        <Detail
          label={t("help.fields.reference.label")}
          value={reference ?? "—"}
        />
      </dl>

      {!isClosed && (
        <div className="flex shrink-0 items-center gap-1">
          {isSaving && <Spinner size="sm" className="text-ink-subtle" />}
          <Button
            type="button"
            size="sm"
            intent="ghost"
            className="btn-no-lift px-2"
            aria-label={t("help.detail.editDetails")}
            disabled={isSaving}
            onClick={() => setEditing(true)}
            data-testid="support-details-edit"
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

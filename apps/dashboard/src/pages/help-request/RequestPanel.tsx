import { Button } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  replySupportRequest,
  supportPendingKeys,
} from "@stores/support/actions";
import {
  selectIsSupportPending,
  selectSupportError,
} from "@stores/support/selector";
import type {
  SupportMessage,
  SupportRequestDetail,
} from "@stores/support/type";
import { formatDateTime } from "@utils/format";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FieldRow, Form, FormTextArea } from "@/components/form";
import { SectionCard, SectionFooter } from "@/components/layout";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import {
  BODY_MAX_LENGTH,
  type ReplyValues,
  replySchema,
} from "@/pages/help/validation";
import { DetailsFields } from "./DetailsFields";

function MessageRow({ message }: { message: SupportMessage }) {
  const { t } = useTranslation();

  return (
    <li
      className="flex flex-col gap-1.5 px-6 py-4"
      data-testid={`support-message-${message.id}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-ink-strong text-sm">
          {message.author === "SUPPORT"
            ? t("help.detail.fromSupport")
            : t("help.detail.fromYou")}
        </span>
        <time dateTime={message.createdAt} className="text-ink-subtle text-xs">
          {formatDateTime(message.createdAt)}
        </time>
      </div>
      <p className="whitespace-pre-wrap break-words text-ink-body text-sm">
        {message.body}
      </p>
    </li>
  );
}

export function RequestPanel({ request }: { request: SupportRequestDetail }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSending = useAppSelector(
    selectIsSupportPending(supportPendingKeys.reply(request.id)),
  );
  const error = useAppSelector(selectSupportError);

  const form = useForm<ReplyValues>({
    resolver: zodResolver(replySchema),
    mode: "onTouched",
    defaultValues: { body: "" },
  });
  const { handleSubmit, reset, control } = form;
  const body = useWatch({ control, name: "body" });

  useOnSuccess(isSending, Boolean(error), () => reset({ body: "" }));

  const isClosed = request.status === "CLOSED";

  const thread: SupportMessage[] = [
    {
      id: `${request.id}-description`,
      author: "CUSTOMER",
      body: request.description,
      createdAt: request.createdAt,
    },
    ...request.messages,
  ];

  return (
    <SectionCard
      title={t("help.detail.requestTitle")}
      description={
        isClosed
          ? t("help.detail.requestClosedLead")
          : t("help.detail.requestLead")
      }
      data-testid="support-conversation"
    >
      <DetailsFields request={request} />

      <ol className="-mx-6 divide-y divide-overlay/10 border-overlay/10 border-y">
        {thread.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
      </ol>

      {isClosed ? (
        <p className="text-ink-muted text-sm">{t("help.detail.replyClosed")}</p>
      ) : (
        <Form
          form={form}
          onSubmit={handleSubmit((data) =>
            dispatch(
              replySupportRequest({ id: request.id, body: data.body.trim() }),
            ),
          )}
        >
          <FieldRow
            title={t("help.detail.replyLabel")}
            description={t("help.detail.replyHint")}
            htmlFor="support-reply"
          >
            <FormTextArea
              name="body"
              rows={4}
              maxLength={BODY_MAX_LENGTH}
              placeholder={t("help.detail.replyPlaceholder")}
            />
          </FieldRow>

          <div className="mt-5">
            <SectionFooter>
              <Button
                type="submit"
                intent="invert"
                size="sm"
                className="btn-no-lift min-w-20 text-sm"
                loading={isSending}
                disabled={!body?.trim()}
                data-testid="support-reply-submit"
              >
                {t("help.detail.send")}
              </Button>
            </SectionFooter>
          </div>
        </Form>
      )}
    </SectionCard>
  );
}

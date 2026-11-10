import { Button, Card, cn, Spinner } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  supportPendingKeys,
  updateSupportRequest,
} from "@stores/support/actions";
import { selectIsSupportPending } from "@stores/support/selector";
import type { SupportRequestDetail, SupportStatus } from "@stores/support/type";
import { formatDateTime } from "@utils/format";
import { CircleCheck, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isDone, STATUS_LABEL_KEYS } from "@/pages/help/constants";

const TONE = {
  OPEN: { text: "text-brand", fill: "bg-brand" },
  IN_PROGRESS: { text: "text-brand", fill: "bg-brand" },
  WAITING_ON_CUSTOMER: { text: "text-warning", fill: "bg-warning" },
  RESOLVED: { text: "text-success", fill: "bg-success" },
  CLOSED: { text: "text-ink-muted", fill: "bg-ink-subtle" },
} as const satisfies Record<SupportStatus, { text: string; fill: string }>;

const STAGE: Record<SupportStatus, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  WAITING_ON_CUSTOMER: 1,
  RESOLVED: 2,
  CLOSED: 2,
};

const stagesFor = (status: SupportStatus): SupportStatus[] => [
  "OPEN",
  status === "WAITING_ON_CUSTOMER" ? "WAITING_ON_CUSTOMER" : "IN_PROGRESS",
  status === "CLOSED" ? "CLOSED" : "RESOLVED",
];

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-ink-muted text-xs">{label}</dt>
      <dd className="m-0 truncate text-ink-body text-sm">{value}</dd>
    </div>
  );
}

export function StatusPanel({ request }: { request: SupportRequestDetail }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isPending = useAppSelector(
    selectIsSupportPending(supportPendingKeys.row(request.id)),
  );

  const { status } = request;
  const tone = TONE[status];
  const stage = STAGE[status];
  const done = isDone(status);
  const Icon = done ? RotateCcw : CircleCheck;

  return (
    <Card className="flex flex-col gap-5" data-testid="support-status">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn("h-2.5 w-2.5 shrink-0 rounded-full", tone.fill)}
          />
          <span
            className={cn("truncate font-semibold text-base", tone.text)}
            data-testid="support-status-label"
          >
            {t(STATUS_LABEL_KEYS[status])}
          </span>
        </div>

        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift shrink-0"
          disabled={isPending}
          onClick={() =>
            dispatch(
              updateSupportRequest({
                id: request.id,
                data: { status: done ? "OPEN" : "CLOSED" },
              }),
            )
          }
          data-testid="support-detail-toggle-status"
        >
          <span className="flex items-center gap-1.5 text-sm">
            {isPending ? <Spinner size="sm" /> : <Icon className="h-4 w-4" />}
            {done ? t("help.detail.reopenCta") : t("help.detail.closeCta")}
          </span>
        </Button>
      </div>

      <ol
        aria-label={t("help.detail.progress")}
        className="m-0 grid list-none grid-cols-3 gap-2 p-0"
      >
        {stagesFor(status).map((step, index) => {
          const reached = index <= stage;
          const current = index === stage;
          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              className="flex min-w-0 flex-col gap-2"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1 rounded-full transition-colors duration-300",
                  reached ? tone.fill : "bg-overlay/10",
                )}
              />
              <span
                className={cn(
                  "truncate text-xs",
                  current
                    ? "font-medium text-ink-strong"
                    : reached
                      ? "text-ink-body"
                      : "text-ink-subtle",
                )}
              >
                {t(STATUS_LABEL_KEYS[step])}
              </span>
            </li>
          );
        })}
      </ol>

      <dl className="m-0 grid gap-4 rounded-lg bg-overlay/5 px-4 py-3 sm:grid-cols-3">
        <Fact
          label={t("help.detail.opened")}
          value={formatDateTime(request.createdAt)}
        />
        <Fact
          label={t("help.detail.firstResponse")}
          value={
            request.firstRespondedAt
              ? formatDateTime(request.firstRespondedAt)
              : t("help.detail.awaitingResponse")
          }
        />
        <Fact
          label={t("help.detail.lastActivity")}
          value={formatDateTime(request.lastActivityAt)}
        />
      </dl>
    </Card>
  );
}

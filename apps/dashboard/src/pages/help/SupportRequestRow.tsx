import { Checkbox, cn, Spinner } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  supportPendingKeys,
  toggleSupportRequestSelected,
  updateSupportRequest,
} from "@stores/support/actions";
import {
  selectIsSupportPending,
  selectIsSupportRequestSelected,
} from "@stores/support/selector";
import type { SupportRequest } from "@stores/support/type";
import {
  CircleCheck,
  MessageSquare,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { isDone } from "./constants";

export const supportRequestPath = (id: string) =>
  `/help/requests/${encodeURIComponent(id)}`;

export function SupportRequestRow({
  request,
  onEdit,
  onDelete,
}: {
  request: SupportRequest;
  onEdit: (request: SupportRequest) => void;
  onDelete: (request: SupportRequest) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const isPending = useAppSelector(
    selectIsSupportPending(supportPendingKeys.row(request.id)),
  );
  const isSelected = useAppSelector(selectIsSupportRequestSelected(request.id));

  const isClosed = request.status === "CLOSED";

  return (
    <div
      className={cn(
        "group relative flex w-full items-start gap-3 bg-surface px-4 py-4 transition-colors has-[a:focus-visible]:bg-overlay/5",
        isSelected ? "bg-overlay/10" : "hover:bg-overlay/5",
      )}
      data-testid={`support-row-${request.id}`}
    >
      <Checkbox
        aria-label={t("help.row.select", { subject: request.subject })}
        variant="square"
        className="relative z-10 mt-0.5 w-auto shrink-0"
        checked={isSelected}
        onChange={() => dispatch(toggleSupportRequestSelected(request.id))}
        data-testid={`support-select-${request.id}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Link
          to={supportRequestPath(request.id)}
          className="min-w-0 truncate font-semibold text-base text-ink-strong after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          data-testid={`support-link-${request.id}`}
        >
          {request.subject}
        </Link>

        <p className="line-clamp-2 min-w-0 break-words text-ink-muted text-sm">
          {request.description}
        </p>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-has-[a:focus-visible]:opacity-100 lg:group-hover:opacity-100">
        {isPending && <Spinner size="sm" className="mr-1 text-ink-subtle" />}

        <RowActionsMenu
          label={t("help.row.more", { subject: request.subject })}
          disabled={isPending}
          width="w-56"
          data-testid={`support-more-${request.id}`}
        >
          <RowActionsMenu.Item
            icon={MessageSquare}
            onSelect={() => navigate(supportRequestPath(request.id))}
          >
            {t("help.row.open")}
          </RowActionsMenu.Item>

          {!isClosed && (
            <RowActionsMenu.Item
              icon={Pencil}
              onSelect={() => onEdit(request)}
              data-testid={`support-edit-${request.id}`}
            >
              {t("help.row.edit")}
            </RowActionsMenu.Item>
          )}

          <RowActionsMenu.Item
            icon={isDone(request.status) ? RotateCcw : CircleCheck}
            onSelect={() =>
              dispatch(
                updateSupportRequest({
                  id: request.id,
                  data: { status: isDone(request.status) ? "OPEN" : "CLOSED" },
                }),
              )
            }
            data-testid={`support-toggle-status-${request.id}`}
          >
            {isDone(request.status)
              ? t("help.row.reopen")
              : t("help.row.close")}
          </RowActionsMenu.Item>

          <RowActionsMenu.Item
            icon={Trash2}
            tone="danger"
            onSelect={() => onDelete(request)}
            data-testid={`support-delete-${request.id}`}
          >
            {t("help.row.delete")}
          </RowActionsMenu.Item>
        </RowActionsMenu>
      </div>
    </div>
  );
}

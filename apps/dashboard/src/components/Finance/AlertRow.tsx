import { Button, Card, cn, Tag } from "@4mica/ui";
import {
  acknowledgeAlert,
  financePendingKeys,
  selectIsFinancePending,
} from "@stores/finance";
import type { FinancialAlert } from "@stores/finance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { formatDateTime } from "@utils/format";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

const KIND_VARIANT: Record<
  string,
  "warning" | "error" | "neutral" | "default"
> = {
  BUDGET_THRESHOLD: "warning",
  POLICY_DENIAL: "error",
  UNAUTHORIZED_SPEND: "error",
  APPROVAL_REQUESTED: "default",
};

export function AlertRow({
  alert,
  canManage,
}: {
  alert: FinancialAlert;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsFinancePending(financePendingKeys.alert(alert.id)),
  );
  const acknowledged = Boolean(alert.acknowledgedAt);

  return (
    <Card
      className={cn("flex items-start gap-4", acknowledged && "opacity-70")}
      data-testid={`alert-${alert.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Tag size="sm" variant={KIND_VARIANT[alert.kind] ?? "neutral"}>
            {t(`finance.alertKind.${alert.kind}`, { defaultValue: alert.kind })}
          </Tag>
          <span className="font-medium text-ink-strong text-sm">
            {alert.title}
          </span>
        </div>
        {alert.detail && (
          <p className="mt-1 text-ink-muted text-sm">{alert.detail}</p>
        )}
        <p className="mt-1 text-ink-subtle text-xs">
          {formatDateTime(alert.createdAt)}
          {acknowledged &&
            ` · ${t("finance.alerts.acknowledgedBy", {
              name: alert.acknowledgedBy?.name ?? "—",
              date: formatDateTime(alert.acknowledgedAt),
            })}`}
        </p>
      </div>
      {canManage && !acknowledged && (
        <Button
          type="button"
          intent="outline"
          size="sm"
          className="btn-no-lift shrink-0"
          icon={<Check aria-hidden="true" className="h-4 w-4" />}
          loading={isPending}
          onClick={() => dispatch(acknowledgeAlert({ id: alert.id }))}
          data-testid={`alert-ack-${alert.id}`}
        >
          {t("finance.alerts.acknowledge")}
        </Button>
      )}
    </Card>
  );
}

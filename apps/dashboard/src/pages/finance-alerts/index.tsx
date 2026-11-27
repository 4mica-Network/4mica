import { Button, Card, cn, Tag } from "@4mica/ui";
import {
  acknowledgeAlert,
  fetchList,
  financePendingKeys,
  selectAlerts,
  selectIsFinancePending,
  setListFilters,
} from "@stores/finance";
import { ALERT_KINDS, type FinancialAlert } from "@stores/finance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectCan } from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import { formatDateTime } from "@utils/format";
import { BellRing, Check } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FinancePage } from "@/components/Finance/FinancePage";
import { ListState } from "@/components/Finance/ListState";
import { LoadMore } from "@/components/Finance/LoadMore";
import { ListToolbar } from "@/components/ListToolbar";

const KIND_VARIANT: Record<
  string,
  "warning" | "error" | "neutral" | "default"
> = {
  BUDGET_THRESHOLD: "warning",
  POLICY_DENIAL: "error",
  UNAUTHORIZED_SPEND: "error",
  APPROVAL_REQUESTED: "default",
};

function AlertRow({
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

export function FinanceAlerts() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const alerts = useAppSelector(selectAlerts);
  const canManage = useAppSelector(selectCan(PERMISSION.FINANCE_MANAGE));

  useEffect(() => {
    dispatch(fetchList("alerts"));
  }, [dispatch]);

  const filter = (next: { acknowledged?: string; kind?: string }) => {
    dispatch(setListFilters("alerts", next));
    dispatch(fetchList("alerts"));
  };

  return (
    <FinancePage
      titleKey="finance.alerts.title"
      descriptionKey="finance.alerts.description"
    >
      <div className="flex flex-col gap-4">
        <ListToolbar>
          <ListToolbar.Filters>
            <ListToolbar.Filter
              label={t("finance.filter.status")}
              value={alerts.filters.acknowledged}
              options={[
                { value: "false", title: t("finance.alerts.open") },
                { value: "true", title: t("finance.alerts.acknowledged") },
                { value: "", title: t("finance.filter.allStatuses") },
              ]}
              onChange={(acknowledged) => filter({ acknowledged })}
              data-testid="alert-status-filter"
            />
            <ListToolbar.Filter
              label={t("finance.filter.kind")}
              value={alerts.filters.kind}
              options={[
                { value: "", title: t("finance.filter.allKinds") },
                ...ALERT_KINDS.map((kind) => ({
                  value: kind,
                  title: t(`finance.alertKind.${kind}`),
                })),
              ]}
              onChange={(kind) => filter({ kind })}
              data-testid="alert-kind-filter"
            />
          </ListToolbar.Filters>
        </ListToolbar>

        <ListState
          status={alerts.status}
          error={alerts.error}
          isEmpty={alerts.items.length === 0}
          empty={{
            icon: <BellRing className="h-5 w-5" />,
            title: t("finance.alerts.emptyTitle"),
            description: t("finance.alerts.emptyDescription"),
          }}
          onRetry={() => dispatch(fetchList("alerts"))}
          data-testid="alerts"
        >
          <div className="flex flex-col gap-2" data-testid="alerts-list">
            {alerts.items.map((alert) => (
              <AlertRow key={alert.id} alert={alert} canManage={canManage} />
            ))}
          </div>
        </ListState>

        <LoadMore
          visible={alerts.status === "loaded" && Boolean(alerts.nextCursor)}
          loading={alerts.isLoadingMore}
          onClick={() => dispatch(fetchList("alerts", { append: true }))}
          data-testid="alerts-load-more"
        />
      </div>
    </FinancePage>
  );
}

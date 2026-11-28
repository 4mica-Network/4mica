import { fetchList, selectAlerts, setListFilters } from "@stores/finance";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { BellRing } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertRow } from "@/components/Finance/AlertRow";
import { ListState } from "@/components/Finance/ListState";
import { LoadMore } from "@/components/Finance/LoadMore";

export const BUDGET_ALERT_FILTERS = {
  kind: "BUDGET_THRESHOLD",
  acknowledged: "false",
};

export function BudgetAlerts({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const alerts = useAppSelector(selectAlerts);

  useEffect(() => {
    dispatch(setListFilters("alerts", BUDGET_ALERT_FILTERS));
    dispatch(fetchList("alerts"));
  }, [dispatch]);

  return (
    <section className="mt-8 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-base text-ink-strong">
          {t("finance.limits.alertsTitle")}
        </h2>
        <p className="mt-1 text-ink-muted text-sm">
          {t("finance.limits.alertsDescription")}
        </p>
      </div>
      <ListState
        status={alerts.status}
        error={alerts.error}
        isEmpty={alerts.items.length === 0}
        empty={{
          icon: <BellRing className="h-5 w-5" />,
          title: t("finance.limits.alertsEmpty"),
        }}
        onRetry={() => dispatch(fetchList("alerts"))}
        data-testid="budget-alerts"
      >
        <div className="flex flex-col gap-2" data-testid="budget-alerts-list">
          {alerts.items.map((alert) => (
            <AlertRow key={alert.id} alert={alert} canManage={canManage} />
          ))}
        </div>
      </ListState>
      <LoadMore
        visible={alerts.status === "loaded" && Boolean(alerts.nextCursor)}
        loading={alerts.isLoadingMore}
        onClick={() => dispatch(fetchList("alerts", { append: true }))}
        data-testid="budget-alerts-load-more"
      />
    </section>
  );
}

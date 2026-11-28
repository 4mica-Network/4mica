import { fetchList, selectAlerts, setListFilters } from "@stores/finance";
import { ALERT_KINDS } from "@stores/finance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectCan } from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import { BellRing } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertRow } from "@/components/Finance/AlertRow";
import { FinancePage } from "@/components/Finance/FinancePage";
import { ListState } from "@/components/Finance/ListState";
import { LoadMore } from "@/components/Finance/LoadMore";
import { ListToolbar } from "@/components/ListToolbar";

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

import { EmptyState } from "@4mica/ui";
import { fetchBalances } from "@stores/balance/actions";
import { selectBalanceState } from "@stores/balance/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  fetchPaymentStats,
  fetchPaymentSummary,
} from "@stores/payment/actions";
import {
  selectPaymentStats,
  selectPaymentSummary,
} from "@stores/payment/selector";
import { ArrowRightLeft, Landmark, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PageSpinner } from "@/components/PageSpinner";
import { usePageTitle } from "@/hooks/usePageTitle";
import { CashFlowChart, type Range } from "./CashFlowChart";
import { CollateralTable } from "./CollateralTable";
import { KpiStrip } from "./KpiStrip";
import { Leaderboard } from "./Leaderboard";
import { totalsByAsset } from "./metrics";
import { Panel } from "./Panel";

export function Overview() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>(6);

  const summary = useAppSelector(selectPaymentSummary);
  const stats = useAppSelector(selectPaymentStats);
  const balances = useAppSelector(selectBalanceState);

  usePageTitle(t("page.overview.title"));

  useEffect(() => {
    dispatch(fetchPaymentSummary());
    dispatch(fetchBalances());
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchPaymentStats(range));
  }, [dispatch, range]);

  if (!summary || !stats || (balances.isLoading && !balances.hasLoaded)) {
    return <PageSpinner />;
  }

  const assets = balances.hasLoaded ? totalsByAsset(balances.wallets) : null;
  const noPayments = summary.received.count === 0 && summary.sent.count === 0;
  const noWallets = balances.hasLoaded && balances.wallets.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
            {t("page.overview.title")}
          </h1>
          <p className="mt-1 text-ink-muted text-sm">
            {t("page.overview.description")}
          </p>
        </div>
      </div>

      {noPayments && noWallets ? (
        <EmptyState
          className="flex-1"
          icon={<ArrowRightLeft className="h-5 w-5" />}
          title={t("overview.empty.title")}
          description={t("overview.empty.description")}
          data-testid="overview-empty"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <KpiStrip
            summary={summary}
            assets={assets}
            walletCount={balances.wallets.length}
          />

          <CashFlowChart stats={stats} range={range} onRangeChange={setRange} />

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="flex min-w-0 lg:col-span-3">
              {balances.error && !balances.isLoading ? (
                <Panel
                  title={t("overview.collateral.title")}
                  testId="overview-collateral"
                  className="flex-1"
                >
                  <EmptyState
                    className="flex-1"
                    icon={<TriangleAlert className="h-5 w-5" />}
                    title={t("balance.errorState.title")}
                    description={balances.error}
                    action={{
                      label: t("balance.errorState.retry"),
                      onClick: () => dispatch(fetchBalances()),
                    }}
                    data-testid="balance-error"
                  />
                </Panel>
              ) : noWallets ? (
                <Panel
                  title={t("overview.collateral.title")}
                  testId="overview-collateral"
                  className="flex-1"
                >
                  <EmptyState
                    className="flex-1"
                    icon={<Landmark className="h-5 w-5" />}
                    title={t("balance.empty.title")}
                    description={t("balance.empty.description")}
                    action={{
                      label: t("balance.empty.action"),
                      onClick: () => navigate("/wallet"),
                    }}
                    data-testid="balance-empty"
                  />
                </Panel>
              ) : (
                <div className="flex min-w-0 flex-1 [&>section]:flex-1">
                  <CollateralTable
                    wallets={balances.wallets}
                    assets={assets ?? []}
                  />
                </div>
              )}
            </div>

            <div className="flex min-w-0 lg:col-span-2 [&>section]:flex-1">
              <Leaderboard
                listings={stats.topListings}
                agents={stats.topAgents}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

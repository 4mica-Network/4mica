import { PAYMENT_NETWORKS } from "@4mica/rules";
import { EmptyState, Spinner, Tag } from "@4mica/ui";
import { fetchBalances } from "@stores/balance/actions";
import { selectBalanceState } from "@stores/balance/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { Landmark, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { BalanceTiles } from "./BalanceTiles";
import { WalletBalanceRow } from "./WalletBalanceRow";

export function Balances() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const { network, wallets, isLoading, hasLoaded, error } =
    useAppSelector(selectBalanceState);

  useEffect(() => {
    dispatch(fetchBalances());
  }, [dispatch]);

  const showSpinner = isLoading && !hasLoaded;
  const showError = Boolean(error) && !isLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
            {t("page.balances.title")}
          </h1>
          {network && (
            <Tag size="sm" variant="neutral" data-testid="balance-network">
              {PAYMENT_NETWORKS[network].label}
            </Tag>
          )}
        </div>
        <p className="mt-1 text-ink-muted text-sm">
          {t("page.balances.description")}
        </p>
      </div>

      {showSpinner ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" className="text-ink-subtle" />
        </div>
      ) : showError ? (
        <EmptyState
          className="flex-1"
          icon={<TriangleAlert className="h-5 w-5" />}
          title={t("balance.errorState.title")}
          description={error ?? undefined}
          action={{
            label: t("balance.errorState.retry"),
            onClick: () => dispatch(fetchBalances()),
          }}
          data-testid="balance-error"
        />
      ) : wallets.length === 0 ? (
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
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <BalanceTiles wallets={wallets} />

          <div className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10">
            {wallets.map((wallet) => (
              <WalletBalanceRow key={wallet.id} wallet={wallet} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

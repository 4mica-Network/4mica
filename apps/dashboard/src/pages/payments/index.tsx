import { EmptyState, Pagination, Spinner } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  fetchPaymentSummary,
  fetchPayments,
  setPaymentFilters,
  setPaymentPage,
} from "@stores/payment/actions";
import {
  selectHasLoadedPayments,
  selectIsPaymentsLoading,
  selectPaymentError,
  selectPaymentFilters,
  selectPaymentLimit,
  selectPaymentPage,
  selectPaymentSummary,
  selectPayments,
  selectPaymentTotal,
} from "@stores/payment/selector";
import type {
  PaymentDirection,
  PaymentNetwork,
  PaymentStatus,
} from "@stores/payment/type";
import { ArrowRightLeft, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ListToolbar } from "@/components/ListToolbar";
import { PaymentRow } from "@/components/PaymentRow";
import { NETWORK_OPTIONS } from "@/lib/networks";
import { SummaryTiles } from "./SummaryTiles";

export function Payments() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const payments = useAppSelector(selectPayments);
  const total = useAppSelector(selectPaymentTotal);
  const page = useAppSelector(selectPaymentPage);
  const limit = useAppSelector(selectPaymentLimit);
  const filters = useAppSelector(selectPaymentFilters);
  const summary = useAppSelector(selectPaymentSummary);
  const isLoading = useAppSelector(selectIsPaymentsLoading);
  const hasLoaded = useAppSelector(selectHasLoadedPayments);
  const error = useAppSelector(selectPaymentError);

  useEffect(() => {
    dispatch(fetchPayments());
    dispatch(fetchPaymentSummary());
  }, [dispatch]);

  const hasFilters = Boolean(
    filters.q || filters.direction || filters.status || filters.network,
  );
  const showSpinner = isLoading && !hasLoaded;
  const showError = Boolean(error) && !hasLoaded && !isLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6">
        <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
          {t("page.payments.title")}
        </h1>
        <p className="mt-1 text-ink-muted text-sm">
          {t("page.payments.description")}
        </p>
      </div>

      <SummaryTiles summary={summary} />

      <div className="mt-6 flex min-h-0 flex-1 flex-col gap-4">
        <ListToolbar>
          <ListToolbar.Search
            value={filters.q}
            placeholder={t("payment.toolbar.searchPlaceholder")}
            onSearch={(q) => dispatch(setPaymentFilters({ q }))}
            data-testid="payment-search"
          />

          <ListToolbar.Filters>
            <ListToolbar.Filter<PaymentDirection | "">
              label={t("list.filter.direction")}
              className="sm:w-40"
              value={filters.direction}
              options={[
                { value: "", title: t("payment.toolbar.allDirections") },
                { value: "received", title: t("payment.direction.received") },
                { value: "sent", title: t("payment.direction.sent") },
              ]}
              onChange={(direction) =>
                dispatch(setPaymentFilters({ direction }))
              }
              data-testid="payment-direction-filter"
            />

            <ListToolbar.Filter<PaymentStatus | "">
              label={t("list.filter.status")}
              className="sm:w-40"
              value={filters.status}
              options={[
                { value: "", title: t("payment.toolbar.allStatuses") },
                { value: "SETTLED", title: t("payment.status.settled") },
                { value: "PENDING", title: t("payment.status.pending") },
                { value: "FAILED", title: t("payment.status.failed") },
              ]}
              onChange={(status) => dispatch(setPaymentFilters({ status }))}
              data-testid="payment-status-filter"
            />

            <ListToolbar.Filter<PaymentNetwork | "">
              label={t("list.filter.network")}
              value={filters.network}
              options={[
                { value: "", title: t("payment.toolbar.allNetworks") },
                ...NETWORK_OPTIONS,
              ]}
              onChange={(network) => dispatch(setPaymentFilters({ network }))}
              data-testid="payment-network-filter"
            />
          </ListToolbar.Filters>
        </ListToolbar>

        {showSpinner ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size="lg" className="text-ink-subtle" />
          </div>
        ) : showError ? (
          <EmptyState
            className="flex-1"
            icon={<TriangleAlert className="h-5 w-5" />}
            title={t("payment.errorState.title")}
            description={error ?? undefined}
            action={{
              label: t("payment.errorState.retry"),
              onClick: () => dispatch(fetchPayments()),
            }}
            data-testid="payment-error"
          />
        ) : payments.length === 0 ? (
          <EmptyState
            className="flex-1"
            icon={<ArrowRightLeft className="h-5 w-5" />}
            title={
              hasFilters
                ? t("payment.empty.filteredTitle")
                : t("payment.empty.title")
            }
            description={
              hasFilters
                ? t("payment.empty.filteredDescription")
                : t("payment.empty.description")
            }
            data-testid="payment-empty"
          />
        ) : (
          <div className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10">
            {payments.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
          </div>
        )}

        {total > 0 && (
          <div className="flex justify-end">
            <Pagination
              page={page}
              perPage={limit}
              total={total}
              onPrev={() => dispatch(setPaymentPage(page - 1))}
              onNext={() => dispatch(setPaymentPage(page + 1))}
              labels={{
                previous: t("payment.pagination.previous"),
                next: t("payment.pagination.next"),
              }}
              data-testid="payment"
            />
          </div>
        )}
      </div>
    </div>
  );
}

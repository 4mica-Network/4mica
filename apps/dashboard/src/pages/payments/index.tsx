import { EmptyState, InputField, Pagination, Select, Spinner } from "@4mica/ui";
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
import { useDebounceEffect } from "ahooks";
import { ArrowRightLeft, Search, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NETWORK_OPTIONS } from "@/lib/networks";
import { PaymentRow } from "./PaymentRow";
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

  const [search, setSearch] = useState(filters.q);

  useEffect(() => {
    dispatch(fetchPayments());
    dispatch(fetchPaymentSummary());
  }, [dispatch]);

  useEffect(() => {
    setSearch(filters.q);
  }, [filters.q]);

  useDebounceEffect(
    () => {
      if (search !== filters.q) {
        dispatch(setPaymentFilters({ q: search }));
      }
    },
    [search],
    { wait: 450 },
  );

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 sm:w-72">
            <InputField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("payment.toolbar.searchPlaceholder")}
              aria-label={t("payment.toolbar.searchPlaceholder")}
              icon={<Search className="h-4 w-4 text-ink-subtle" />}
              maxLength={100}
              data-testid="payment-search"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="w-full sm:w-40">
              <Select
                value={filters.direction}
                options={[
                  { value: "", title: t("payment.toolbar.allDirections") },
                  { value: "received", title: t("payment.direction.received") },
                  { value: "sent", title: t("payment.direction.sent") },
                ]}
                onChange={(option) =>
                  dispatch(
                    setPaymentFilters({
                      direction: (option?.value ?? "") as PaymentDirection | "",
                    }),
                  )
                }
                data-testid="payment-direction-filter"
              />
            </div>

            <div className="w-full sm:w-40">
              <Select
                value={filters.status}
                options={[
                  { value: "", title: t("payment.toolbar.allStatuses") },
                  { value: "SETTLED", title: t("payment.status.settled") },
                  { value: "PENDING", title: t("payment.status.pending") },
                  { value: "FAILED", title: t("payment.status.failed") },
                ]}
                onChange={(option) =>
                  dispatch(
                    setPaymentFilters({
                      status: (option?.value ?? "") as PaymentStatus | "",
                    }),
                  )
                }
                data-testid="payment-status-filter"
              />
            </div>

            <div className="w-full sm:w-44">
              <Select
                value={filters.network}
                options={[
                  { value: "", title: t("payment.toolbar.allNetworks") },
                  ...NETWORK_OPTIONS,
                ]}
                onChange={(option) =>
                  dispatch(
                    setPaymentFilters({
                      network: (option?.value ?? "") as PaymentNetwork | "",
                    }),
                  )
                }
                data-testid="payment-network-filter"
              />
            </div>
          </div>
        </div>

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

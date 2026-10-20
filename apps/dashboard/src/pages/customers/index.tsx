import { Button, EmptyState, Pagination, Spinner } from "@4mica/ui";
import {
  batchDeleteCustomers,
  fetchCustomers,
  setCustomerPage,
} from "@stores/customer/actions";
import {
  selectCustomerError,
  selectCustomerFilters,
  selectCustomerLimit,
  selectCustomerPage,
  selectCustomers,
  selectCustomerTotal,
  selectHasLoadedCustomers,
  selectIsCustomersLoading,
  selectSelectedCustomerIds,
} from "@stores/customer/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { Plus, TriangleAlert, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/usePageTitle";
import { CreateCustomerModal } from "./CreateCustomerModal";
import { CustomerRow } from "./CustomerRow";
import { CustomerToolbar } from "./CustomerToolbar";
import { DeleteCustomerDialog } from "./DeleteCustomerDialog";

export function Customers() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const customers = useAppSelector(selectCustomers);
  const total = useAppSelector(selectCustomerTotal);
  const page = useAppSelector(selectCustomerPage);
  const limit = useAppSelector(selectCustomerLimit);
  const filters = useAppSelector(selectCustomerFilters);
  const selectedIds = useAppSelector(selectSelectedCustomerIds);
  const isLoading = useAppSelector(selectIsCustomersLoading);
  const hasLoaded = useAppSelector(selectHasLoadedCustomers);
  const error = useAppSelector(selectCustomerError);

  usePageTitle(t("page.customers.title"));

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchCustomers());
  }, [dispatch]);

  const hasFilters = Boolean(
    filters.q || filters.type || filters.status || filters.network,
  );
  const showSpinner = isLoading && !hasLoaded;
  const showError = Boolean(error) && !hasLoaded && !isLoading;

  const confirmBatchDelete = () => {
    dispatch(batchDeleteCustomers({ ids: selectedIds }));
    setIsBatchDeleteOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
            {t("page.customers.title")}
          </h1>
          <p className="mt-1 text-ink-muted text-sm">
            {t("page.customers.description")}
          </p>
        </div>

        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift shrink-0"
          onClick={() => setIsCreateOpen(true)}
          data-testid="customer-create-button"
        >
          <span className="flex items-center gap-1.5 text-sm">
            <Plus className="h-4 w-4" />
            {t("customer.create.cta")}
          </span>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {hasLoaded && (customers.length > 0 || hasFilters) && (
          <CustomerToolbar onBatchDelete={() => setIsBatchDeleteOpen(true)} />
        )}

        {showSpinner ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size="lg" className="text-ink-subtle" />
          </div>
        ) : showError ? (
          <EmptyState
            className="flex-1"
            icon={<TriangleAlert className="h-5 w-5" />}
            title={t("customer.errorState.title")}
            description={error ?? undefined}
            action={{
              label: t("customer.errorState.retry"),
              onClick: () => dispatch(fetchCustomers()),
            }}
            data-testid="customer-error"
          />
        ) : customers.length === 0 ? (
          <EmptyState
            className="flex-1"
            icon={<Users className="h-5 w-5" />}
            title={
              hasFilters
                ? t("customer.empty.filteredTitle")
                : t("customer.empty.title")
            }
            description={
              hasFilters
                ? t("customer.empty.filteredDescription")
                : t("customer.empty.description")
            }
            action={
              hasFilters ? undefined : (
                <Button
                  type="button"
                  intent="invert"
                  size="sm"
                  className="btn-no-lift"
                  onClick={() => setIsCreateOpen(true)}
                  data-testid="customer-empty-create"
                >
                  <span className="flex items-center gap-1.5 text-sm">
                    <Plus className="h-4 w-4" />
                    {t("customer.create.cta")}
                  </span>
                </Button>
              )
            }
            data-testid="customer-empty"
          />
        ) : (
          <div className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10">
            {customers.map((customer) => (
              <CustomerRow key={customer.id} customer={customer} />
            ))}
          </div>
        )}

        {total > 0 && (
          <div className="flex justify-end">
            <Pagination
              page={page}
              perPage={limit}
              total={total}
              onPrev={() => dispatch(setCustomerPage(page - 1))}
              onNext={() => dispatch(setCustomerPage(page + 1))}
              labels={{
                previous: t("customer.pagination.previous"),
                next: t("customer.pagination.next"),
              }}
              data-testid="customer"
            />
          </div>
        )}
      </div>

      <CreateCustomerModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <DeleteCustomerDialog
        customer={null}
        count={selectedIds.length}
        isOpen={isBatchDeleteOpen}
        onConfirm={confirmBatchDelete}
        onClose={() => setIsBatchDeleteOpen(false)}
      />
    </div>
  );
}

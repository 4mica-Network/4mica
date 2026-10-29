import { Button, EmptyState, Pagination } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  batchDeleteSupportRequests,
  deleteSupportRequest,
  fetchSupportRequests,
  setSupportPage,
} from "@stores/support/actions";
import {
  selectHasLoadedSupport,
  selectIsSupportLoading,
  selectSelectedSupportIds,
  selectSupportError,
  selectSupportFilters,
  selectSupportLimit,
  selectSupportPage,
  selectSupportRequests,
  selectSupportTotal,
} from "@stores/support/selector";
import type { SupportRequest } from "@stores/support/type";
import { LifeBuoy, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageSpinner } from "@/components/PageSpinner";
import { usePageTitle } from "@/hooks/usePageTitle";
import { CreateSupportRequestModal } from "./CreateSupportRequestModal";
import { DeleteSupportRequestDialog } from "./DeleteSupportRequestDialog";
import { EditSupportRequestModal } from "./EditSupportRequestModal";
import { SupportRequestRow } from "./SupportRequestRow";
import { SupportToolbar } from "./SupportToolbar";

export function Help() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const requests = useAppSelector(selectSupportRequests);
  const total = useAppSelector(selectSupportTotal);
  const page = useAppSelector(selectSupportPage);
  const limit = useAppSelector(selectSupportLimit);
  const filters = useAppSelector(selectSupportFilters);
  const selectedIds = useAppSelector(selectSelectedSupportIds);
  const isLoading = useAppSelector(selectIsSupportLoading);
  const hasLoaded = useAppSelector(selectHasLoadedSupport);
  const error = useAppSelector(selectSupportError);

  usePageTitle(t("page.help.title"));

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SupportRequest | null>(null);
  const [deleting, setDeleting] = useState<SupportRequest | null>(null);
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchSupportRequests());
  }, [dispatch]);

  const hasFilters = Boolean(filters.q || filters.status || filters.category);
  const showSpinner = isLoading && !hasLoaded;
  const showError = Boolean(error) && !hasLoaded && !isLoading;

  const confirmDelete = () => {
    if (deleting) {
      dispatch(deleteSupportRequest({ id: deleting.id }));
      setDeleting(null);
    }
  };

  const confirmBatchDelete = () => {
    dispatch(batchDeleteSupportRequests({ ids: selectedIds }));
    setIsBatchDeleteOpen(false);
  };

  const newRequestButton = (testId: string) => (
    <Button
      type="button"
      intent="invert"
      size="sm"
      className="btn-no-lift shrink-0"
      onClick={() => setIsCreateOpen(true)}
      data-testid={testId}
    >
      <span className="flex items-center gap-1.5 text-sm">
        <Plus className="h-4 w-4" />
        {t("help.create.cta")}
      </span>
    </Button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
            {t("page.help.title")}
          </h1>
          <p className="mt-1 text-ink-muted text-sm">
            {t("page.help.description")}
          </p>
        </div>

        {newRequestButton("help-create-button")}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {hasLoaded && (requests.length > 0 || hasFilters) && (
          <SupportToolbar onBatchDelete={() => setIsBatchDeleteOpen(true)} />
        )}

        {showSpinner ? (
          <PageSpinner />
        ) : showError ? (
          <EmptyState
            className="flex-1"
            icon={<TriangleAlert className="h-5 w-5" />}
            title={t("help.errorState.title")}
            description={error ?? undefined}
            action={{
              label: t("help.errorState.retry"),
              onClick: () => dispatch(fetchSupportRequests()),
            }}
            data-testid="support-error"
          />
        ) : requests.length === 0 ? (
          <EmptyState
            className="flex-1"
            icon={<LifeBuoy className="h-5 w-5" />}
            title={
              hasFilters ? t("help.empty.filteredTitle") : t("help.empty.title")
            }
            description={
              hasFilters
                ? t("help.empty.filteredDescription")
                : t("help.empty.description")
            }
            action={
              hasFilters ? undefined : newRequestButton("help-empty-create")
            }
            data-testid="support-empty"
          />
        ) : (
          <div className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10">
            {requests.map((request) => (
              <SupportRequestRow
                key={request.id}
                request={request}
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}

        {total > 0 && (
          <div className="flex justify-end">
            <Pagination
              page={page}
              perPage={limit}
              total={total}
              onPrev={() => dispatch(setSupportPage(page - 1))}
              onNext={() => dispatch(setSupportPage(page + 1))}
              labels={{
                previous: t("help.pagination.previous"),
                next: t("help.pagination.next"),
              }}
              data-testid="support"
            />
          </div>
        )}
      </div>

      <CreateSupportRequestModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <EditSupportRequestModal
        request={editing}
        onClose={() => setEditing(null)}
      />

      <DeleteSupportRequestDialog
        request={deleting}
        count={selectedIds.length}
        isOpen={Boolean(deleting) || isBatchDeleteOpen}
        onConfirm={deleting ? confirmDelete : confirmBatchDelete}
        onClose={() => {
          setDeleting(null);
          setIsBatchDeleteOpen(false);
        }}
      />
    </div>
  );
}

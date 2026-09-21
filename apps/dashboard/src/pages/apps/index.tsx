import { Button, EmptyState, Pagination, Spinner } from "@4mica/ui";
import {
  batchDeleteApiListings,
  deleteApiListing,
  fetchApiListings,
  setApiListingPage,
} from "@stores/apiListing/actions";
import {
  selectApiListingError,
  selectApiListingFilters,
  selectApiListingLimit,
  selectApiListingPage,
  selectApiListings,
  selectApiListingTotal,
  selectHasLoadedApiListings,
  selectIsApiListingsLoading,
  selectSelectedApiListingIds,
} from "@stores/apiListing/selector";
import type { ApiListing } from "@stores/apiListing/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useTitle } from "ahooks";
import { ArrowUpRight, Blocks, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { links } from "@/lib/links";
import { ApiListingRow } from "./ApiListingRow";
import { ApiListingToolbar } from "./ApiListingToolbar";
import { CreateApiListingModal } from "./CreateApiListingModal";
import { DeleteApiListingDialog } from "./DeleteApiListingDialog";
import { EditApiListingModal } from "./EditApiListingModal";
import { EndpointsEditor } from "./EndpointsEditor";

export function Apps() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const listings = useAppSelector(selectApiListings);
  const total = useAppSelector(selectApiListingTotal);
  const page = useAppSelector(selectApiListingPage);
  const limit = useAppSelector(selectApiListingLimit);
  const filters = useAppSelector(selectApiListingFilters);
  const selectedIds = useAppSelector(selectSelectedApiListingIds);
  const isLoading = useAppSelector(selectIsApiListingsLoading);
  const hasLoaded = useAppSelector(selectHasLoadedApiListings);
  const error = useAppSelector(selectApiListingError);

  useTitle(`${t("page.apps.title")} - ${t("org")}`);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApiListing | null>(null);
  const [editingEndpoints, setEditingEndpoints] = useState<ApiListing | null>(
    null,
  );
  const [deleting, setDeleting] = useState<ApiListing | null>(null);
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchApiListings());
  }, [dispatch]);

  const hasFilters = Boolean(
    filters.q || filters.visibility || filters.network,
  );
  const showSpinner = isLoading && !hasLoaded;
  const showError = Boolean(error) && !hasLoaded && !isLoading;

  const confirmDelete = () => {
    if (deleting) {
      dispatch(deleteApiListing({ id: deleting.id }));
      setDeleting(null);
    }
  };

  const confirmBatchDelete = () => {
    dispatch(batchDeleteApiListings({ ids: selectedIds }));
    setIsBatchDeleteOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
            {t("page.apps.title")}
          </h1>
          <p className="mt-1 text-ink-muted text-sm">
            {t("page.apps.description")}
          </p>
        </div>

        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift shrink-0"
          onClick={() => setIsCreateOpen(true)}
          data-testid="api-listing-create-button"
        >
          <span className="flex items-center gap-1.5 text-sm">
            <Plus className="h-4 w-4" />
            {t("apiListing.create.cta")}
          </span>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {hasLoaded && (listings.length > 0 || hasFilters) && (
          <ApiListingToolbar onBatchDelete={() => setIsBatchDeleteOpen(true)} />
        )}

        {showSpinner ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size="lg" className="text-ink-subtle" />
          </div>
        ) : showError ? (
          <EmptyState
            className="flex-1"
            icon={<TriangleAlert className="h-5 w-5" />}
            title={t("apiListing.errorState.title")}
            description={error ?? undefined}
            action={{
              label: t("apiListing.errorState.retry"),
              onClick: () => dispatch(fetchApiListings()),
            }}
            data-testid="api-listing-error"
          />
        ) : listings.length === 0 ? (
          <EmptyState
            className="flex-1"
            icon={<Blocks className="h-5 w-5" />}
            title={
              hasFilters
                ? t("apiListing.empty.filteredTitle")
                : t("apiListing.empty.title")
            }
            description={
              hasFilters
                ? t("apiListing.empty.filteredDescription")
                : t("apiListing.empty.description")
            }
            action={
              hasFilters ? undefined : (
                <div className="flex flex-col items-center gap-3">
                  <Button
                    type="button"
                    intent="invert"
                    size="sm"
                    className="btn-no-lift"
                    onClick={() => setIsCreateOpen(true)}
                    data-testid="api-listing-empty-create"
                  >
                    <span className="flex items-center gap-1.5 text-sm">
                      <Plus className="h-4 w-4" />
                      {t("apiListing.create.cta")}
                    </span>
                  </Button>
                  <a
                    href={links.docs}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1 text-ink-subtle text-xs transition-colors hover:text-ink-body"
                  >
                    {t("apiListing.empty.learnMore")}
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
              )
            }
            data-testid="api-listing-empty"
          />
        ) : (
          <div className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10">
            {listings.map((listing) => (
              <ApiListingRow
                key={listing.id}
                listing={listing}
                onEdit={setEditing}
                onEditEndpoints={setEditingEndpoints}
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
              onPrev={() => dispatch(setApiListingPage(page - 1))}
              onNext={() => dispatch(setApiListingPage(page + 1))}
              labels={{
                previous: t("apiListing.pagination.previous"),
                next: t("apiListing.pagination.next"),
              }}
              data-testid="api-listing"
            />
          </div>
        )}
      </div>

      <CreateApiListingModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <EditApiListingModal listing={editing} onClose={() => setEditing(null)} />

      <EndpointsEditor
        listing={editingEndpoints}
        onClose={() => setEditingEndpoints(null)}
      />

      <DeleteApiListingDialog
        listing={deleting}
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

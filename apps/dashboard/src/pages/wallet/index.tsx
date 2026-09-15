import { Button, EmptyState, Pagination, Spinner } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  batchDeleteWallets,
  deleteWallet,
  fetchWallets,
  setWalletPage,
} from "@stores/wallet/actions";
import {
  selectHasLoadedWallets,
  selectIsWalletsLoading,
  selectSelectedWalletIds,
  selectWalletError,
  selectWalletFilters,
  selectWalletLimit,
  selectWalletPage,
  selectWallets,
  selectWalletTotal,
} from "@stores/wallet/selector";
import type { Wallet as WalletType } from "@stores/wallet/type";
import { useTitle } from "ahooks";
import { ArrowUpRight, Plus, TriangleAlert, WalletMinimal } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { links } from "@/lib/links";
import { CreateWalletModal } from "./CreateWalletModal";
import { DeleteWalletDialog } from "./DeleteWalletDialog";
import { EditWalletModal } from "./EditWalletModal";
import { WalletRow } from "./WalletRow";
import { WalletToolbar } from "./WalletToolbar";

export function Wallet() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const wallets = useAppSelector(selectWallets);
  const total = useAppSelector(selectWalletTotal);
  const page = useAppSelector(selectWalletPage);
  const limit = useAppSelector(selectWalletLimit);
  const filters = useAppSelector(selectWalletFilters);
  const selectedIds = useAppSelector(selectSelectedWalletIds);
  const isLoading = useAppSelector(selectIsWalletsLoading);
  const hasLoaded = useAppSelector(selectHasLoadedWallets);
  const error = useAppSelector(selectWalletError);

  useTitle(`${t("page.wallet.title")} - ${t("org")}`);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<WalletType | null>(null);
  const [deleting, setDeleting] = useState<WalletType | null>(null);
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchWallets());
  }, [dispatch]);

  const hasFilters = Boolean(filters.q || filters.status || filters.network);
  // Only blank the list on the very first load; later fetches redraw in place
  // so the toolbar does not jump while you type.
  const showSpinner = isLoading && !hasLoaded;
  // A failed first load must not render as "No wallets yet" — that tells the
  // user something false about their account.
  const showError = Boolean(error) && !hasLoaded && !isLoading;

  const confirmDelete = () => {
    if (deleting) {
      dispatch(deleteWallet({ id: deleting.id }));
      setDeleting(null);
    }
  };

  const confirmBatchDelete = () => {
    dispatch(batchDeleteWallets({ ids: selectedIds }));
    setIsBatchDeleteOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
            {t("page.wallet.title")}
          </h1>
          <p className="mt-1 text-ink-muted text-sm">
            {t("page.wallet.description")}
          </p>
        </div>

        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift shrink-0"
          onClick={() => setIsCreateOpen(true)}
          data-testid="wallet-create-button"
        >
          <span className="flex items-center gap-1.5 text-sm">
            <Plus className="h-4 w-4" />
            {t("wallet.create.cta")}
          </span>
        </Button>
      </div>

      {/* flex-1 + min-h-0 so the empty and error states below can stretch to
          the bottom of the viewport instead of hugging the header. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {hasLoaded && (wallets.length > 0 || hasFilters) && (
          <WalletToolbar onBatchDelete={() => setIsBatchDeleteOpen(true)} />
        )}

        {showSpinner ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size="lg" className="text-ink-subtle" />
          </div>
        ) : showError ? (
          <EmptyState
            // flex-1 rather than a centering wrapper: the card itself should
            // fill the space, matching the empty state below it.
            className="flex-1"
            icon={<TriangleAlert className="h-5 w-5" />}
            title={t("wallet.errorState.title")}
            description={error ?? undefined}
            action={{
              label: t("wallet.errorState.retry"),
              onClick: () => dispatch(fetchWallets()),
            }}
            data-testid="wallet-error"
          />
        ) : wallets.length === 0 ? (
          <EmptyState
            className="flex-1"
            icon={<WalletMinimal className="h-5 w-5" />}
            title={
              hasFilters
                ? t("wallet.empty.filteredTitle")
                : t("wallet.empty.title")
            }
            description={
              hasFilters
                ? t("wallet.empty.filteredDescription")
                : t("wallet.empty.description")
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
                    data-testid="wallet-empty-create"
                  >
                    <span className="flex items-center gap-1.5 text-sm">
                      <Plus className="h-4 w-4" />
                      {t("wallet.create.cta")}
                    </span>
                  </Button>
                  <a
                    href={links.docsWallet}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1 text-ink-subtle text-xs transition-colors hover:text-ink-body"
                  >
                    {t("wallet.empty.learnMore")}
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
              )
            }
            data-testid="wallet-empty"
          />
        ) : (
          // One frame around the group with `divide-y` separators: the rows
          // butt together as a single table, and `overflow-hidden` is what
          // clips the corners so only the first and last rows are rounded.
          <div className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10">
            {wallets.map((wallet) => (
              <WalletRow
                key={wallet.id}
                wallet={wallet}
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
              onPrev={() => dispatch(setWalletPage(page - 1))}
              onNext={() => dispatch(setWalletPage(page + 1))}
              labels={{
                previous: t("wallet.pagination.previous"),
                next: t("wallet.pagination.next"),
              }}
              data-testid="wallet"
            />
          </div>
        )}
      </div>

      <CreateWalletModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <EditWalletModal wallet={editing} onClose={() => setEditing(null)} />

      <DeleteWalletDialog
        wallet={deleting}
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

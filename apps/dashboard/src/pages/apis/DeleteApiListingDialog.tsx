import { Button, Modal, Spinner } from "@4mica/ui";
import { selectIsApiListingPending } from "@stores/apiListing/selector";
import type { ApiListing } from "@stores/apiListing/type";
import { useAppSelector } from "@stores/hooks";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export function DeleteApiListingDialog({
  listing,
  count,
  isOpen,
  onConfirm,
  onClose,
}: {
  listing: ApiListing | null;
  count: number;
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const isPending = useAppSelector(
    selectIsApiListingPending(
      listing ? `apiListing:${listing.id}` : "batchDeleteApiListings",
    ),
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        listing
          ? t("apiListing.delete.title")
          : t("apiListing.delete.batchTitle", { count })
      }
      size="sm"
      data-testid="delete-api-listing"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            intent="ghost"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            {t("apiListing.delete.cancel")}
          </Button>
          <Button
            intent="primary"
            size="sm"
            className="btn-no-lift min-w-24 bg-danger text-surface-deep hover:bg-danger"
            disabled={isPending}
            onClick={onConfirm}
            data-testid="delete-api-listing-confirm"
          >
            <span className="flex w-full items-center justify-center text-sm">
              {isPending ? (
                <Spinner size="sm" />
              ) : (
                t("apiListing.delete.confirm")
              )}
            </span>
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="text-ink-body text-sm">
            {listing
              ? t("apiListing.delete.body", { name: listing.name })
              : t("apiListing.delete.batchBody", { count })}
          </p>
          <p className="mt-2 text-ink-subtle text-xs">
            {t("apiListing.delete.hint")}
          </p>
        </div>
      </div>
    </Modal>
  );
}

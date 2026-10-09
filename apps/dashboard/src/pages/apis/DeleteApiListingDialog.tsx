import { apiListingPendingKeys } from "@stores/apiListing/actions";
import { selectIsApiListingPending } from "@stores/apiListing/selector";
import type { ApiListing } from "@stores/apiListing/type";
import { useAppSelector } from "@stores/hooks";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

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
  const isPending = useAppSelector(
    selectIsApiListingPending(
      listing
        ? apiListingPendingKeys.row(listing.id)
        : apiListingPendingKeys.batchDelete,
    ),
  );

  return (
    <DeleteConfirmDialog
      ns="apiListing"
      data-testid="delete-api-listing"
      item={listing ? { name: listing.name } : null}
      count={count}
      isOpen={isOpen}
      isPending={isPending}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

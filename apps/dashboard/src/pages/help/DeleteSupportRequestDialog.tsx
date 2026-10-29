import { useAppSelector } from "@stores/hooks";
import { supportPendingKeys } from "@stores/support/actions";
import { selectIsSupportPending } from "@stores/support/selector";
import type { SupportRequest } from "@stores/support/type";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

export function DeleteSupportRequestDialog({
  request,
  count,
  isOpen,
  onConfirm,
  onClose,
}: {
  request: SupportRequest | null;
  count: number;
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isPending = useAppSelector(
    selectIsSupportPending(
      request
        ? supportPendingKeys.row(request.id)
        : supportPendingKeys.batchDelete,
    ),
  );

  return (
    <DeleteConfirmDialog
      ns="help"
      data-testid="delete-support-request"
      item={
        request
          ? { subject: request.subject, number: String(request.number) }
          : null
      }
      count={count}
      isOpen={isOpen}
      isPending={isPending}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

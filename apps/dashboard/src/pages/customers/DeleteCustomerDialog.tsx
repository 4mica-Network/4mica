import { customerPendingKeys } from "@stores/customer/actions";
import { selectIsCustomerPending } from "@stores/customer/selector";
import type { Customer } from "@stores/customer/type";
import { useAppSelector } from "@stores/hooks";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

export function DeleteCustomerDialog({
  customer,
  count,
  isOpen,
  onConfirm,
  onClose,
}: {
  customer: Customer | null;
  count: number;
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isPending = useAppSelector(
    selectIsCustomerPending(
      customer
        ? customerPendingKeys.row(customer.id)
        : customerPendingKeys.batchDelete,
    ),
  );

  return (
    <DeleteConfirmDialog
      ns="customer"
      data-testid="delete-customer"
      item={customer ? { name: customer.name } : null}
      count={count}
      isOpen={isOpen}
      isPending={isPending}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

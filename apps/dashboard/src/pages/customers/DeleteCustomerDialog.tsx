import { Button, Modal, Spinner } from "@4mica/ui";
import { selectIsCustomerPending } from "@stores/customer/selector";
import type { Customer } from "@stores/customer/type";
import { useAppSelector } from "@stores/hooks";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  const isPending = useAppSelector(
    selectIsCustomerPending(
      customer ? `customer:${customer.id}` : "batchDeleteCustomers",
    ),
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        customer
          ? t("customer.delete.title")
          : t("customer.delete.batchTitle", { count })
      }
      size="sm"
      data-testid="delete-customer"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            intent="ghost"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            {t("customer.delete.cancel")}
          </Button>
          <Button
            intent="primary"
            size="sm"
            className="btn-no-lift min-w-24 bg-danger text-surface-deep hover:bg-danger"
            disabled={isPending}
            onClick={onConfirm}
            data-testid="delete-customer-confirm"
          >
            <span className="flex w-full items-center justify-center text-sm">
              {isPending ? <Spinner size="sm" /> : t("customer.delete.confirm")}
            </span>
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="text-ink-body text-sm">
            {customer
              ? t("customer.delete.body", { name: customer.name })
              : t("customer.delete.batchBody", { count })}
          </p>
          <p className="mt-2 text-ink-subtle text-xs">
            {t("customer.delete.hint")}
          </p>
        </div>
      </div>
    </Modal>
  );
}

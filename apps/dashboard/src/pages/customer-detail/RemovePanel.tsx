import { Button, Spinner } from "@4mica/ui";
import { customerPendingKeys, deleteCustomer } from "@stores/customer/actions";
import { selectIsCustomerPending } from "@stores/customer/selector";
import type { Customer } from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ConfirmAction } from "@/components/ConfirmAction";
import { SectionCard } from "@/components/layout";

export function RemovePanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const isDeleting = useAppSelector(
    selectIsCustomerPending(customerPendingKeys.row(customer.id)),
  );

  const sawDeleting = useRef(false);
  useEffect(() => {
    if (isDeleting) {
      sawDeleting.current = true;
      return;
    }
    if (sawDeleting.current) {
      sawDeleting.current = false;
      navigate("/customers");
    }
  }, [isDeleting, navigate]);

  return (
    <SectionCard
      title={t("customer.detail.removeTitle")}
      description={t("customer.detail.removeLead")}
      data-testid="customer-remove"
      action={
        <ConfirmAction
          title={t("customer.remove.confirmTitle")}
          description={t("customer.remove.confirmDescription")}
          confirmLabel={t("customer.remove.confirm")}
          onConfirm={() => dispatch(deleteCustomer({ id: customer.id }))}
          data-testid="customer-remove"
        >
          <Button
            type="button"
            intent="invert"
            size="sm"
            className="btn-no-lift"
            disabled={isDeleting}
            data-testid="customer-remove-button"
          >
            <span className="flex items-center gap-1.5 text-sm">
              {isDeleting ? (
                <Spinner size="sm" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t("customer.remove.cta")}
            </span>
          </Button>
        </ConfirmAction>
      }
    >
      <p className="text-ink-muted text-sm">{t("customer.remove.hint")}</p>
    </SectionCard>
  );
}

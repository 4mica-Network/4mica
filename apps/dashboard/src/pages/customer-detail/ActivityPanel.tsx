import { EmptyState, Pagination } from "@4mica/ui";
import { setCustomerActivityPage } from "@stores/customer/actions";
import {
  selectCustomerActivity,
  selectCustomerActivityLimit,
  selectCustomerActivityPage,
  selectCustomerActivityTotal,
} from "@stores/customer/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { ArrowRightLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PaymentRow } from "../payments/PaymentRow";

export function ActivityPanel({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const items = useAppSelector(selectCustomerActivity);
  const total = useAppSelector(selectCustomerActivityTotal);
  const page = useAppSelector(selectCustomerActivityPage);
  const limit = useAppSelector(selectCustomerActivityLimit);

  if (total === 0) {
    return (
      <EmptyState
        icon={<ArrowRightLeft className="h-5 w-5" />}
        title={t("customer.activity.emptyTitle")}
        description={t("customer.activity.emptyDescription")}
        data-testid="customer-activity-empty"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10">
        {items.map((payment) => (
          <PaymentRow key={payment.id} payment={payment} />
        ))}
      </div>

      <div className="flex justify-end">
        <Pagination
          page={page}
          perPage={limit}
          total={total}
          onPrev={() => dispatch(setCustomerActivityPage(customerId, page - 1))}
          onNext={() => dispatch(setCustomerActivityPage(customerId, page + 1))}
          labels={{
            previous: t("customer.pagination.previous"),
            next: t("customer.pagination.next"),
          }}
          data-testid="customer-activity"
        />
      </div>
    </div>
  );
}

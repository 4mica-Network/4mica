import { Button, Spinner, Tag } from "@4mica/ui";
import {
  grantCustomerCredit,
  zeroCustomerCredit,
} from "@stores/customer/actions";
import {
  selectCustomerCredit,
  selectCustomerCreditEntries,
  selectIsCustomerPending,
} from "@stores/customer/selector";
import type { Customer, CustomerCreditKind } from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextInput } from "@/components/form";
import {
  CREDIT_KIND_LABEL_KEYS,
  CREDIT_KIND_OPTIONS,
} from "../customers/constants";
import { trimAmount } from "../payments/constants";
import {
  SectionCard,
  SectionInset,
  SectionRow,
  SectionRows,
} from "./SectionCard";

const when = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });

function GrantForm({
  customerId,
  onDone,
}: {
  customerId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(selectIsCustomerPending("customerCredit"));

  const [kind, setKind] = useState<CustomerCreditKind>("PROMOTIONAL");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const submit = () => {
    dispatch(
      grantCustomerCredit({
        id: customerId,
        data: {
          kind,
          amount: amount.trim(),
          reason: reason.trim() === "" ? null : reason.trim(),
        },
      }),
    );
    onDone();
  };

  return (
    <SectionInset data-testid="customer-credit-form">
      <div className="flex flex-col gap-4">
        <FieldRow title={t("customer.credit.kind")} htmlFor="credit-kind">
          <Select
            id="credit-kind"
            value={kind}
            onChange={(value) => setKind(value as CustomerCreditKind)}
            options={CREDIT_KIND_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.titleKey),
            }))}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.credit.amount")}
          description={t("customer.credit.amountHint")}
          htmlFor="credit-amount"
        >
          <TextInput
            id="credit-amount"
            value={amount}
            onChange={setAmount}
            placeholder="5.00"
          />
        </FieldRow>

        <FieldRow title={t("customer.credit.reason")} htmlFor="credit-reason">
          <TextInput
            id="credit-reason"
            value={reason}
            onChange={setReason}
            placeholder={t("customer.credit.reasonPlaceholder")}
            maxLength={280}
          />
        </FieldRow>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          intent="ghost"
          size="sm"
          disabled={isSaving}
          onClick={onDone}
        >
          {t("customer.credit.cancel")}
        </Button>
        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift w-24"
          disabled={isSaving || amount.trim() === ""}
          onClick={submit}
          data-testid="customer-credit-save"
        >
          <span className="flex w-full items-center justify-center text-sm">
            {isSaving ? <Spinner size="sm" /> : t("customer.credit.save")}
          </span>
        </Button>
      </div>
    </SectionInset>
  );
}

export function CreditPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const balance = useAppSelector(selectCustomerCredit);
  const entries = useAppSelector(selectCustomerCreditEntries);
  const isZeroing = useAppSelector(
    selectIsCustomerPending("customerCreditZero"),
  );

  const [isGranting, setIsGranting] = useState(false);

  const hasBalance = balance !== null && Number(balance.total) !== 0;

  return (
    <SectionCard
      title={t("customer.detail.creditTitle")}
      description={t("customer.detail.creditLead")}
      data-testid="customer-credit"
      action={
        !isGranting && (
          <Button
            type="button"
            intent="invert"
            size="sm"
            className="btn-no-lift"
            onClick={() => setIsGranting(true)}
            data-testid="customer-credit-add"
          >
            <span className="flex items-center gap-1.5 text-sm">
              <Plus className="h-4 w-4" />
              {t("customer.credit.add")}
            </span>
          </Button>
        )
      }
    >
      <div
        className="flex flex-col gap-5"
        data-testid="customer-credit-balance"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="font-medium text-ink-strong text-sm">
              {t("customer.credit.balance")}
            </span>
            <p className="mt-0.5 text-ink-muted text-sm">
              {t("customer.credit.split", {
                promotional: trimAmount(balance?.promotional ?? "0"),
                prepaid: trimAmount(balance?.prepaid ?? "0"),
              })}
            </p>
          </div>

          <span className="shrink-0 font-semibold text-ink-strong text-sm">
            {trimAmount(balance?.total ?? "0")} {customer.limitCurrency}
          </span>
        </div>

        {hasBalance && (
          <div className="flex justify-end">
            <Button
              type="button"
              intent="ghost"
              size="sm"
              className="btn-no-lift text-danger"
              disabled={isZeroing}
              onClick={() => dispatch(zeroCustomerCredit({ id: customer.id }))}
              data-testid="customer-credit-zero"
            >
              <span className="flex items-center gap-1.5 text-sm">
                {isZeroing && <Spinner size="sm" />}
                {t("customer.credit.zero")}
              </span>
            </Button>
          </div>
        )}
      </div>

      {isGranting && (
        <GrantForm
          customerId={customer.id}
          onDone={() => setIsGranting(false)}
        />
      )}

      {entries.length > 0 && (
        <SectionRows data-testid="customer-credit-ledger">
          {entries.map((entry) => (
            <SectionRow key={entry.id}>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="font-medium text-ink-strong text-sm">
                  {entry.reason ?? t(CREDIT_KIND_LABEL_KEYS[entry.kind])}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag size="sm" variant="neutral">
                    {t(CREDIT_KIND_LABEL_KEYS[entry.kind])}
                  </Tag>
                  <span className="text-ink-muted text-sm">
                    {when(entry.createdAt)}
                  </span>
                </div>
              </div>

              <span
                className={
                  entry.amount.startsWith("-")
                    ? "shrink-0 font-medium text-danger text-sm"
                    : "shrink-0 font-medium text-sm text-success"
                }
              >
                {entry.amount.startsWith("-") ? "" : "+"}
                {trimAmount(entry.amount)}
              </span>
            </SectionRow>
          ))}
        </SectionRows>
      )}
    </SectionCard>
  );
}

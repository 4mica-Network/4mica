import { Button, cn, Spinner } from "@4mica/ui";
import {
  resetCustomerUsage,
  setCustomerPolicy,
} from "@stores/customer/actions";
import {
  selectCustomerIssues,
  selectIsCustomerPolicyPending,
  selectIsCustomerUsageResetPending,
} from "@stores/customer/selector";
import type { Customer } from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextInput } from "@/components/form";
import { useDraft } from "@/hooks/useDraft";
import {
  QUOTA_PERIOD_OPTIONS,
  QUOTA_UNIT_OPTIONS,
} from "../customers/constants";
import { trimAmount } from "../payments/constants";
import { SectionCard, SectionFooter, SectionInset } from "./SectionCard";

const blankToNull = (value: string): string | null =>
  value.trim() === "" ? null : value.trim();

function QuotaUsage({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isResetting = useAppSelector(
    selectIsCustomerUsageResetPending(customer.id),
  );

  if (!customer.freeQuota || customer.quotaUsed === null) {
    return null;
  }

  const quota = Number(customer.freeQuota);
  const used = Number(customer.quotaUsed);
  const percent =
    quota > 0 ? Math.min(Math.round((used / quota) * 100), 999) : 0;
  const exhausted = used >= quota;

  return (
    <SectionInset className="gap-3" data-testid="customer-quota-usage">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="font-medium text-ink-strong text-sm">
            {t("customer.policy.usageTitle")}
          </span>
          <p className="mt-0.5 text-ink-muted text-sm">
            {t("customer.policy.usageCount", {
              used: trimAmount(customer.quotaUsed),
              quota: trimAmount(customer.freeQuota),
            })}
          </p>
        </div>

        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift shrink-0"
          disabled={isResetting}
          onClick={() => dispatch(resetCustomerUsage({ id: customer.id }))}
          data-testid="customer-reset-usage"
        >
          <span className="flex items-center gap-1.5 text-sm">
            {isResetting && <Spinner size="sm" />}
            {t("customer.policy.reset")}
          </span>
        </Button>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-overlay/10">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            exhausted ? "bg-danger" : "bg-brand",
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>

      <span
        className={cn("text-sm", exhausted ? "text-danger" : "text-ink-muted")}
      >
        {exhausted
          ? t("customer.policy.usageExhausted")
          : t("customer.policy.usageRemaining", {
              remaining: trimAmount(customer.quotaRemaining ?? "0"),
            })}
      </span>
    </SectionInset>
  );
}

export function PolicyPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(selectIsCustomerPolicyPending(customer.id));
  const issues = useAppSelector(selectCustomerIssues);

  const initial = useMemo(
    () => ({
      freeQuotaUnit: customer.freeQuotaUnit ?? "",
      freeQuota: customer.freeQuota ?? "",
      freeQuotaPeriod: customer.freeQuotaPeriod ?? "",
      discountPercent: customer.discountPercent ?? "",
      discountFixed: customer.discountFixed ?? "",
      minPaymentAmount: customer.minPaymentAmount ?? "",
      approvalThreshold: customer.approvalThreshold ?? "",
    }),
    [customer],
  );

  const draft = useDraft(initial);

  const save = () => {
    const unit = blankToNull(draft.draft.freeQuotaUnit);

    dispatch(
      setCustomerPolicy({
        id: customer.id,
        data: {
          freeQuotaUnit: unit as never,
          freeQuota: unit ? blankToNull(draft.draft.freeQuota) : null,
          freeQuotaPeriod: unit
            ? (blankToNull(draft.draft.freeQuotaPeriod) as never)
            : null,
          discountPercent: blankToNull(draft.draft.discountPercent),
          discountFixed: blankToNull(draft.draft.discountFixed),
          minPaymentAmount: blankToNull(draft.draft.minPaymentAmount),
          approvalThreshold: blankToNull(draft.draft.approvalThreshold),
        },
      }),
    );
  };

  const hasQuota = draft.draft.freeQuotaUnit !== "";

  return (
    <SectionCard
      title={t("customer.detail.policyTitle")}
      description={t("customer.detail.policyLead")}
      data-testid="customer-policy"
    >
      <QuotaUsage customer={customer} />

      <div className="flex flex-col gap-4">
        <FieldRow
          title={t("customer.policy.quotaUnit")}
          htmlFor="policy-quota-unit"
        >
          <Select
            id="policy-quota-unit"
            value={draft.draft.freeQuotaUnit}
            onChange={(value) => draft.set("freeQuotaUnit", value)}
            options={[
              { value: "", title: t("customer.policy.quotaNone") },
              ...QUOTA_UNIT_OPTIONS.map((option) => ({
                value: option.value,
                title: t(option.titleKey),
              })),
            ]}
          />
        </FieldRow>

        {hasQuota && (
          <>
            <FieldRow
              title={t("customer.policy.quotaValue")}
              htmlFor="policy-quota"
            >
              <TextInput
                id="policy-quota"
                value={draft.draft.freeQuota}
                onChange={(value) => draft.set("freeQuota", value)}
                placeholder={
                  draft.draft.freeQuotaUnit === "REQUESTS" ? "500" : "10.00"
                }
                error={issues.freeQuota}
              />
            </FieldRow>

            <FieldRow
              title={t("customer.policy.quotaPeriod")}
              htmlFor="policy-quota-period"
            >
              <Select
                id="policy-quota-period"
                value={draft.draft.freeQuotaPeriod}
                onChange={(value) => draft.set("freeQuotaPeriod", value)}
                options={QUOTA_PERIOD_OPTIONS.map((option) => ({
                  value: option.value,
                  title: t(option.titleKey),
                }))}
                error={issues.freeQuotaPeriod}
              />
            </FieldRow>
          </>
        )}

        <FieldRow
          title={t("customer.policy.discountPercent")}
          htmlFor="policy-discount-percent"
        >
          <TextInput
            id="policy-discount-percent"
            value={draft.draft.discountPercent}
            onChange={(value) => draft.set("discountPercent", value)}
            placeholder="10"
            error={issues.discountPercent}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.policy.discountFixed")}
          htmlFor="policy-discount-fixed"
        >
          <TextInput
            id="policy-discount-fixed"
            value={draft.draft.discountFixed}
            onChange={(value) => draft.set("discountFixed", value)}
            placeholder="0.50"
            error={issues.discountFixed}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.policy.minPayment")}
          htmlFor="policy-min-payment"
        >
          <TextInput
            id="policy-min-payment"
            value={draft.draft.minPaymentAmount}
            onChange={(value) => draft.set("minPaymentAmount", value)}
            placeholder="0.01"
            error={issues.minPaymentAmount}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.policy.approvalThreshold")}
          htmlFor="policy-approval"
        >
          <TextInput
            id="policy-approval"
            value={draft.draft.approvalThreshold}
            onChange={(value) => draft.set("approvalThreshold", value)}
            placeholder="100"
            error={issues.approvalThreshold}
          />
        </FieldRow>
      </div>

      <SectionFooter>
        <Button
          type="button"
          intent="ghost"
          size="sm"
          disabled={!draft.isDirty || isSaving}
          onClick={draft.reset}
        >
          {t("settings.discard")}
        </Button>
        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift w-20"
          disabled={!draft.isDirty || isSaving}
          onClick={save}
          data-testid="customer-policy-save"
        >
          <span className="flex w-full items-center justify-center text-sm">
            {isSaving ? <Spinner size="sm" /> : t("settings.update")}
          </span>
        </Button>
      </SectionFooter>
    </SectionCard>
  );
}

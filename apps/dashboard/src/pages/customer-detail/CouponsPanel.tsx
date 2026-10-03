import { Button, EmptyState, Spinner, Tag } from "@4mica/ui";
import {
  createCustomerCoupon,
  deleteCustomerCoupon,
  updateCustomerCoupon,
} from "@stores/customer/actions";
import {
  selectCustomerCoupons,
  selectIsCustomerPending,
} from "@stores/customer/selector";
import type {
  Customer,
  CustomerCoupon,
  CustomerCouponKind,
} from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { Ban, Plus, ShieldCheck, TicketPercent, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextInput } from "@/components/form";
import {
  COUPON_KIND_OPTIONS,
  COUPON_UNUSABLE_LABEL_KEYS,
} from "../customers/constants";
import { trimAmount } from "../payments/constants";
import {
  SectionCard,
  SectionInset,
  SectionRow,
  SectionRows,
} from "./SectionCard";

const asDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

const endOfDay = (day: string): string =>
  new Date(`${day}T23:59:59.000Z`).toISOString();

function CouponRow({
  customerId,
  coupon,
}: {
  customerId: string;
  coupon: CustomerCoupon;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isPending = useAppSelector(
    selectIsCustomerPending(`customerCoupon:${coupon.id}`),
  );

  return (
    <SectionRow
      data-testid={`customer-coupon-${coupon.id}`}
      actions={
        <>
          {isPending && <Spinner size="sm" className="mr-1 text-ink-subtle" />}

          <Button
            type="button"
            intent="ghost"
            size="sm"
            className="btn-no-lift"
            disabled={isPending}
            aria-label={
              coupon.revokedAt
                ? t("customer.coupon.restore")
                : t("customer.coupon.revoke")
            }
            onClick={() =>
              dispatch(
                updateCustomerCoupon({
                  id: customerId,
                  couponId: coupon.id,
                  data: { revoked: !coupon.revokedAt },
                }),
              )
            }
            data-testid={`customer-coupon-revoke-${coupon.id}`}
          >
            {coupon.revokedAt ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <Ban className="h-4 w-4" />
            )}
          </Button>

          <Button
            type="button"
            intent="ghost"
            size="sm"
            className="btn-no-lift text-danger"
            disabled={isPending}
            aria-label={t("customer.coupon.remove")}
            onClick={() =>
              dispatch(
                deleteCustomerCoupon({ id: customerId, couponId: coupon.id }),
              )
            }
            data-testid={`customer-coupon-remove-${coupon.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="min-w-0 truncate font-medium text-ink-strong text-sm">
          {coupon.code}
        </span>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Tag size="sm" variant="neutral">
            {coupon.kind === "PERCENT"
              ? t("customer.coupon.offPercent", {
                  value: trimAmount(coupon.value),
                })
              : t("customer.coupon.offFixed", {
                  value: trimAmount(coupon.value),
                })}
          </Tag>

          <Tag size="sm" variant={coupon.unusableReason ? "error" : "success"}>
            {coupon.unusableReason
              ? t(COUPON_UNUSABLE_LABEL_KEYS[coupon.unusableReason])
              : t("customer.coupon.usable")}
          </Tag>
        </div>

        <span className="text-ink-muted text-sm">
          {t("customer.coupon.redeemed", {
            count: coupon.timesRedeemed,
            limit:
              coupon.usageLimit === null
                ? t("customer.coupon.noLimit")
                : coupon.usageLimit,
          })}
          {coupon.expiresAt
            ? ` · ${t("customer.coupon.expires", { when: asDate(coupon.expiresAt) })}`
            : ` · ${t("customer.coupon.noExpiry")}`}
        </span>
      </div>
    </SectionRow>
  );
}

function AddCouponCard({
  customerId,
  onDone,
}: {
  customerId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(selectIsCustomerPending("customerCoupon"));

  const [kind, setKind] = useState<CustomerCouponKind>("PERCENT");
  const [code, setCode] = useState("");
  const [value, setValue] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [usageLimit, setUsageLimit] = useState("");

  const submit = () => {
    dispatch(
      createCustomerCoupon({
        id: customerId,
        data: {
          kind,
          code: code.trim().toUpperCase(),
          value: value.trim(),
          expiresAt: expiresOn === "" ? null : endOfDay(expiresOn),
          usageLimit: usageLimit.trim() === "" ? null : Number(usageLimit),
        },
      }),
    );
    onDone();
  };

  return (
    <SectionInset data-testid="customer-coupon-form">
      <div className="flex flex-col gap-4">
        <FieldRow title={t("customer.coupon.code")} htmlFor="coupon-code">
          <TextInput
            id="coupon-code"
            value={code}
            onChange={setCode}
            format="uppercase"
            placeholder="WELCOME10"
            maxLength={64}
          />
        </FieldRow>

        <FieldRow title={t("customer.coupon.kind")} htmlFor="coupon-kind">
          <Select
            id="coupon-kind"
            value={kind}
            onChange={(next) => setKind(next as CustomerCouponKind)}
            options={COUPON_KIND_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.titleKey),
            }))}
          />
        </FieldRow>

        <FieldRow title={t("customer.coupon.value")} htmlFor="coupon-value">
          <TextInput
            id="coupon-value"
            value={value}
            onChange={setValue}
            placeholder={kind === "PERCENT" ? "10" : "5.00"}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.coupon.expiry")}
          description={t("customer.coupon.expiryHint")}
          htmlFor="coupon-expiry"
        >
          <TextInput
            id="coupon-expiry"
            type="date"
            value={expiresOn}
            onChange={setExpiresOn}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.coupon.limit")}
          description={t("customer.coupon.limitHint")}
          htmlFor="coupon-limit"
        >
          <TextInput
            id="coupon-limit"
            value={usageLimit}
            onChange={setUsageLimit}
            placeholder="1"
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
          {t("customer.coupon.cancel")}
        </Button>
        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift w-24"
          disabled={isSaving || code.trim() === "" || value.trim() === ""}
          onClick={submit}
          data-testid="customer-coupon-save"
        >
          <span className="flex w-full items-center justify-center text-sm">
            {isSaving ? <Spinner size="sm" /> : t("customer.coupon.save")}
          </span>
        </Button>
      </div>
    </SectionInset>
  );
}

export function CouponsPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();

  const coupons = useAppSelector(selectCustomerCoupons);
  const [isAdding, setIsAdding] = useState(false);

  return (
    <SectionCard
      title={t("customer.detail.couponsTitle")}
      description={t("customer.detail.couponsLead")}
      data-testid="customer-coupons"
      action={
        !isAdding && (
          <Button
            type="button"
            intent="invert"
            size="sm"
            className="btn-no-lift"
            onClick={() => setIsAdding(true)}
            data-testid="customer-coupon-add"
          >
            <span className="flex items-center gap-1.5 text-sm">
              <Plus className="h-4 w-4" />
              {t("customer.coupon.add")}
            </span>
          </Button>
        )
      }
    >
      {coupons.length === 0 ? (
        <EmptyState
          icon={<TicketPercent className="h-5 w-5" />}
          title={t("customer.coupon.emptyTitle")}
          description={t("customer.coupon.emptyDescription")}
          data-testid="customer-coupon-empty"
        />
      ) : (
        <SectionRows>
          {coupons.map((coupon) => (
            <CouponRow
              key={coupon.id}
              customerId={customer.id}
              coupon={coupon}
            />
          ))}
        </SectionRows>
      )}

      {isAdding && (
        <AddCouponCard
          customerId={customer.id}
          onDone={() => setIsAdding(false)}
        />
      )}
    </SectionCard>
  );
}

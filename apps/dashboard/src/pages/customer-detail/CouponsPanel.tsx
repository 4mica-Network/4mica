import { isDecimalAmount, trimAmount } from "@4mica/rules";
import { Button, EmptyState, Spinner, Tag } from "@4mica/ui";
import {
  createCustomerCoupon,
  customerPendingKeys,
  deleteCustomerCoupon,
  updateCustomerCoupon,
} from "@stores/customer/actions";
import {
  selectCustomerCoupons,
  selectCustomerError,
  selectCustomerIssues,
  selectIsCustomerPending,
} from "@stores/customer/selector";
import type {
  Customer,
  CustomerCoupon,
  CustomerCouponKind,
} from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { formatDate } from "@utils/format";
import { Ban, Plus, ShieldCheck, TicketPercent, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { FieldRow, Select, TextInput } from "@/components/form";
import {
  SectionCard,
  SectionInset,
  SectionRow,
  SectionRows,
} from "@/components/layout";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import {
  COUPON_KIND_OPTIONS,
  COUPON_UNUSABLE_LABEL_KEYS,
} from "../customers/constants";

const endOfDay = (day: string): string =>
  new Date(`${day}T23:59:59.000Z`).toISOString();

const MAX_USAGE_LIMIT = 2_147_483_647;
const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;
const PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

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
    selectIsCustomerPending(customerPendingKeys.coupon(coupon.id)),
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

          <ConfirmAction
            title={t("customer.coupon.removeConfirm")}
            confirmLabel={t("confirm.remove")}
            onConfirm={() =>
              dispatch(
                deleteCustomerCoupon({ id: customerId, couponId: coupon.id }),
              )
            }
            data-testid={`customer-coupon-remove-${coupon.id}`}
          >
            <Button
              type="button"
              intent="ghost"
              size="sm"
              className="btn-no-lift text-danger"
              disabled={isPending}
              aria-label={t("customer.coupon.remove")}
              data-testid={`customer-coupon-remove-${coupon.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </ConfirmAction>
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
            ? ` · ${t("customer.coupon.expires", { when: formatDate(coupon.expiresAt) })}`
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
  const error = useAppSelector(selectCustomerError);
  const issues = useAppSelector(selectCustomerIssues);

  const [kind, setKind] = useState<CustomerCouponKind>("PERCENT");
  const [code, setCode] = useState("");
  const [value, setValue] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [attempted, setAttempted] = useState(false);

  useOnSuccess(isSaving, error !== null, onDone);

  const trimmedCode = code.trim().toUpperCase();
  const trimmedValue = value.trim();
  const trimmedLimit = usageLimit.trim();

  const errors = {
    code:
      trimmedCode === "" || COUPON_CODE_PATTERN.test(trimmedCode)
        ? undefined
        : t("validation.couponCode"),
    value:
      trimmedValue === ""
        ? undefined
        : kind === "PERCENT"
          ? PERCENT_PATTERN.test(trimmedValue) && Number(trimmedValue) <= 100
            ? undefined
            : t("validation.percent")
          : !isDecimalAmount(trimmedValue)
            ? t("validation.decimal")
            : Number(trimmedValue) > 0
              ? undefined
              : t("validation.positiveNumber"),
    expiresAt:
      expiresOn === "" || new Date(endOfDay(expiresOn)).getTime() > Date.now()
        ? undefined
        : t("validation.futureDate"),
    usageLimit:
      trimmedLimit === ""
        ? undefined
        : !/^\d+$/.test(trimmedLimit)
          ? t("validation.wholeNumber")
          : Number(trimmedLimit) < 1
            ? t("validation.positiveNumber")
            : Number(trimmedLimit) > MAX_USAGE_LIMIT
              ? t("validation.maxValue", { max: MAX_USAGE_LIMIT })
              : undefined,
  };
  const isInvalid =
    trimmedCode === "" ||
    trimmedValue === "" ||
    Object.values(errors).some((message) => message !== undefined);
  const serverIssue = (key: string) =>
    attempted && !isSaving ? issues[key] : undefined;

  const submit = () => {
    if (isSaving || isInvalid) {
      return;
    }
    setAttempted(true);
    dispatch(
      createCustomerCoupon({
        id: customerId,
        data: {
          kind,
          code: trimmedCode,
          value: trimmedValue,
          expiresAt: expiresOn === "" ? null : endOfDay(expiresOn),
          usageLimit: trimmedLimit === "" ? null : Number(trimmedLimit),
        },
      }),
    );
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
            error={errors.code ?? serverIssue("code")}
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
            inputMode="decimal"
            value={value}
            onChange={setValue}
            placeholder={kind === "PERCENT" ? "10" : "5.00"}
            error={errors.value ?? serverIssue("value")}
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
            error={errors.expiresAt ?? serverIssue("expiresAt")}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.coupon.limit")}
          description={t("customer.coupon.limitHint")}
          htmlFor="coupon-limit"
        >
          <TextInput
            id="coupon-limit"
            inputMode="numeric"
            value={usageLimit}
            onChange={setUsageLimit}
            placeholder="1"
            error={errors.usageLimit ?? serverIssue("usageLimit")}
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
          disabled={isSaving || isInvalid}
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
  const addButton = useReturnFocus(isAdding);

  return (
    <SectionCard
      title={t("customer.detail.couponsTitle")}
      description={t("customer.detail.couponsLead")}
      data-testid="customer-coupons"
      action={
        !isAdding && (
          <Button
            ref={addButton}
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

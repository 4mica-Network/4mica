import { Button, Spinner, Tag } from "@4mica/ui";
import { setCustomerStatus } from "@stores/customer/actions";
import { selectIsCustomerStatusPending } from "@stores/customer/selector";
import type { Customer, CustomerStatus } from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextInput } from "@/components/form";
import { useDraft } from "@/hooks/useDraft";
import {
  STATUS_LABEL_KEYS,
  STATUS_OPTIONS,
  STATUS_TAG_VARIANT,
  SUSPEND_DURATION_OPTIONS,
} from "../customers/constants";
import { SectionCard, SectionFooter } from "./SectionCard";

const DEFAULT_SUSPEND_DAYS = "30";

const inDays = (days: string): string =>
  new Date(Date.now() + Number(days) * 86_400_000).toISOString();

const asDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

export function AccessPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isPending = useAppSelector(selectIsCustomerStatusPending(customer.id));

  const initial = useMemo(
    () => ({
      status: customer.status as string,
      suspendDays: DEFAULT_SUSPEND_DAYS,
      reason: customer.statusReason ?? "",
    }),
    [customer],
  );

  const draft = useDraft(initial);

  const status = draft.draft.status as CustomerStatus;
  const reason = draft.draft.reason.trim();

  const save = () => {
    dispatch(
      setCustomerStatus({
        id: customer.id,
        data:
          status === "ACTIVE"
            ? { status: "ACTIVE" }
            : status === "BLOCKED"
              ? { status: "BLOCKED", reason: reason === "" ? null : reason }
              : {
                  status: "SUSPENDED",
                  suspendedUntil: inDays(draft.draft.suspendDays),
                  reason: reason === "" ? null : reason,
                },
      }),
    );
  };

  return (
    <SectionCard
      title={t("customer.detail.accessTitle")}
      description={t("customer.detail.accessLead")}
      action={
        <Tag size="sm" variant={STATUS_TAG_VARIANT[customer.status]}>
          {t(STATUS_LABEL_KEYS[customer.status])}
        </Tag>
      }
      data-testid="customer-access"
    >
      <div className="flex flex-col gap-4">
        <FieldRow title={t("customer.access.status")} htmlFor="access-status">
          <Select
            id="access-status"
            value={draft.draft.status}
            onChange={(value) => draft.set("status", value)}
            options={STATUS_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.titleKey),
            }))}
          />
        </FieldRow>

        {status === "SUSPENDED" && (
          <FieldRow
            title={t("customer.access.suspendFor")}
            htmlFor="access-suspend-days"
          >
            <Select
              id="access-suspend-days"
              value={draft.draft.suspendDays}
              onChange={(value) => draft.set("suspendDays", value)}
              options={SUSPEND_DURATION_OPTIONS.map((option) => ({
                value: option.value,
                title: t(option.titleKey, { count: Number(option.value) }),
              }))}
            />
          </FieldRow>
        )}

        {status !== "ACTIVE" && (
          <FieldRow
            title={t("customer.access.reasonLabel")}
            htmlFor="access-reason"
          >
            <TextInput
              id="access-reason"
              value={draft.draft.reason}
              onChange={(value) => draft.set("reason", value)}
              placeholder={t("customer.access.reasonPlaceholder")}
              maxLength={280}
            />
          </FieldRow>
        )}

        {customer.suspendedUntil && (
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium text-ink-strong text-sm">
              {t("customer.access.suspendedUntil")}
            </span>
            <span className="text-ink-muted text-sm">
              {asDateTime(customer.suspendedUntil)}
            </span>
          </div>
        )}
      </div>

      <SectionFooter>
        <Button
          type="button"
          intent="ghost"
          size="sm"
          disabled={!draft.isDirty || isPending}
          onClick={draft.reset}
        >
          {t("settings.discard")}
        </Button>
        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift w-20"
          disabled={!draft.isDirty || isPending}
          onClick={save}
          data-testid="customer-access-save"
        >
          <span className="flex w-full items-center justify-center text-sm">
            {isPending ? <Spinner size="sm" /> : t("settings.update")}
          </span>
        </Button>
      </SectionFooter>
    </SectionCard>
  );
}

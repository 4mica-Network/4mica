import { Button, Spinner, Tag } from "@4mica/ui";
import { setCustomerStatus } from "@stores/customer/actions";
import { selectIsCustomerStatusPending } from "@stores/customer/selector";
import type { Customer } from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, FieldRow, SettingsSection, TextInput } from "@/components/form";
import { STATUS_LABEL_KEYS, STATUS_TAG_VARIANT } from "../customers/constants";

const SUSPEND_PRESET_DAYS = [7, 30, 90] as const;

const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString();

export function AccessPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isPending = useAppSelector(selectIsCustomerStatusPending(customer.id));

  const [reason, setReason] = useState("");

  const set = (data: Parameters<typeof setCustomerStatus>[0]["data"]) => {
    dispatch(setCustomerStatus({ id: customer.id, data }));
    setReason("");
  };

  const isActive = customer.status === "ACTIVE";

  return (
    <SettingsSection
      title={t("customer.detail.accessTitle")}
      description={t("customer.detail.accessLead")}
      action={
        <Tag size="sm" variant={STATUS_TAG_VARIANT[customer.status]}>
          {t(STATUS_LABEL_KEYS[customer.status])}
        </Tag>
      }
    >
      <Card>
        <div className="flex flex-col gap-5">
          {customer.statusReason && (
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-medium text-ink-strong text-sm">
                {t("customer.access.reasonGiven")}
              </span>
              <span className="text-ink-muted text-sm">
                {customer.statusReason}
              </span>
            </div>
          )}

          {customer.suspendedUntil && (
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-medium text-ink-strong text-sm">
                {t("customer.access.suspendedUntil")}
              </span>
              <span className="text-ink-muted text-sm">
                {new Date(customer.suspendedUntil).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
          )}

          {isActive ? (
            <>
              <FieldRow
                title={t("customer.access.reasonLabel")}
                htmlFor="access-reason"
              >
                <TextInput
                  id="access-reason"
                  value={reason}
                  onChange={setReason}
                  placeholder={t("customer.access.reasonPlaceholder")}
                  maxLength={280}
                />
              </FieldRow>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  intent="invert"
                  size="sm"
                  className="btn-no-lift"
                  disabled={isPending}
                  onClick={() =>
                    set({ status: "BLOCKED", reason: reason || null })
                  }
                  data-testid="customer-block"
                >
                  <span className="flex items-center gap-1.5 text-sm">
                    {isPending && <Spinner size="sm" />}
                    {t("customer.access.block")}
                  </span>
                </Button>

                {SUSPEND_PRESET_DAYS.map((days) => (
                  <Button
                    key={days}
                    type="button"
                    intent="ghost"
                    size="sm"
                    className="btn-no-lift"
                    disabled={isPending}
                    onClick={() =>
                      set({
                        status: "SUSPENDED",
                        suspendedUntil: inDays(days),
                        reason: reason || null,
                      })
                    }
                    data-testid={`customer-suspend-${days}`}
                  >
                    <span className="text-sm">
                      {t("customer.access.suspendDays", { count: days })}
                    </span>
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                intent="invert"
                size="sm"
                className="btn-no-lift"
                disabled={isPending}
                onClick={() => set({ status: "ACTIVE" })}
                data-testid="customer-unblock"
              >
                <span className="flex items-center gap-1.5 text-sm">
                  {isPending && <Spinner size="sm" />}
                  {t("customer.access.reactivate")}
                </span>
              </Button>
            </div>
          )}
        </div>
      </Card>
    </SettingsSection>
  );
}

import { Button, Spinner } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateCustomer } from "@stores/customer/actions";
import {
  selectCustomerIssues,
  selectIsCustomerPending,
} from "@stores/customer/selector";
import type { Customer } from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { FieldRow, Select, TextArea, TextInput } from "@/components/form";
import { STATUS_OPTIONS, TYPE_OPTIONS } from "../customers/constants";
import {
  blankToNull,
  customerDetailsSchema,
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NOTES_MAX_LENGTH,
} from "../customers/validation";

type DetailsValues = z.infer<typeof customerDetailsSchema>;

export function DetailsForm({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(
    selectIsCustomerPending(`customer:${customer.id}`),
  );
  const issues = useAppSelector(selectCustomerIssues);

  const defaults: DetailsValues = {
    name: customer.name,
    email: customer.email ?? "",
    type: customer.type,
    status: customer.status,
    description: customer.description ?? "",
    notes: customer.notes ?? "",
  };

  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<DetailsValues>({
    resolver: zodResolver(customerDetailsSchema),
    mode: "onBlur",
    defaultValues: defaults,
  });

  const values = watch();

  useEffect(() => {
    reset(defaults);
  }, [customer.id, customer.updatedAt]);

  const fieldError = (field: keyof DetailsValues) => {
    if (issues[field]) {
      return issues[field];
    }
    const message = errors[field]?.message;
    return message ? t(message) : undefined;
  };

  const set = (field: keyof DetailsValues) => (value: string) =>
    setValue(field, value as never, {
      shouldValidate: true,
      shouldDirty: true,
    });

  const onValid = (data: DetailsValues) => {
    dispatch(
      updateCustomer({
        id: customer.id,
        data: {
          name: data.name.trim(),
          email: blankToNull(data.email),
          type: data.type,
          status: data.status,
          description: blankToNull(data.description),
          notes: blankToNull(data.notes),
        },
      }),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col divide-y divide-overlay/10">
        <FieldRow title={t("customer.fields.name.label")} htmlFor="detail-name">
          <TextInput
            id="detail-name"
            value={values.name ?? ""}
            onChange={set("name")}
            maxLength={NAME_MAX_LENGTH}
            error={fieldError("name")}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.fields.email.label")}
          htmlFor="detail-email"
        >
          <TextInput
            id="detail-email"
            type="email"
            value={values.email ?? ""}
            onChange={set("email")}
            error={fieldError("email")}
          />
        </FieldRow>

        <FieldRow title={t("customer.fields.type.label")} htmlFor="detail-type">
          <Select
            id="detail-type"
            value={values.type ?? "ORGANIZATION"}
            onChange={set("type")}
            options={TYPE_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.titleKey),
            }))}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.fields.status.label")}
          description={t("customer.fields.status.description")}
          htmlFor="detail-status"
        >
          <Select
            id="detail-status"
            value={values.status ?? "ACTIVE"}
            onChange={set("status")}
            options={STATUS_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.titleKey),
            }))}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.fields.description.label")}
          htmlFor="detail-description"
        >
          <TextArea
            id="detail-description"
            value={values.description ?? ""}
            onChange={set("description")}
            maxLength={DESCRIPTION_MAX_LENGTH}
            error={fieldError("description")}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.fields.notes.label")}
          description={t("customer.fields.notes.description")}
          htmlFor="detail-notes"
        >
          <TextArea
            id="detail-notes"
            value={values.notes ?? ""}
            onChange={set("notes")}
            rows={4}
            maxLength={NOTES_MAX_LENGTH}
            error={fieldError("notes")}
          />
        </FieldRow>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift min-w-28"
          disabled={isSaving || !isDirty}
          onClick={handleSubmit(onValid)}
          data-testid="customer-details-save"
        >
          <span className="flex w-full items-center justify-center text-sm">
            {isSaving ? <Spinner size="sm" /> : t("customer.detail.save")}
          </span>
        </Button>
      </div>
    </div>
  );
}

import type { TFunction } from "i18next";
import type { UseFormSetValue } from "react-hook-form";
import { FieldRow, Select, TextArea, TextInput } from "@/components/form";
import { NETWORK_OPTIONS } from "@/lib/networks";
import { STATUS_OPTIONS, TYPE_OPTIONS } from "./constants";
import {
  type CustomerValues,
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
} from "./validation";

export function CustomerFormFields({
  t,
  values,
  setValue,
  fieldError,
  idPrefix,
  step,
}: {
  t: TFunction;
  values: CustomerValues;
  setValue: UseFormSetValue<CustomerValues>;
  fieldError: (field: keyof CustomerValues) => string | undefined;
  idPrefix: string;
  step: number;
}) {
  const set = (field: keyof CustomerValues) => (value: string) =>
    setValue(field, value as never, { shouldValidate: true });

  if (step === 0) {
    return (
      <div className="flex flex-col divide-y divide-overlay/10">
        <FieldRow
          title={t("customer.fields.name.label")}
          description={t("customer.fields.name.description")}
          htmlFor={`${idPrefix}-name`}
        >
          <TextInput
            id={`${idPrefix}-name`}
            value={values.name ?? ""}
            onChange={set("name")}
            placeholder={t("customer.fields.name.placeholder")}
            maxLength={NAME_MAX_LENGTH}
            error={fieldError("name")}
            autoFocus
          />
        </FieldRow>

        <FieldRow
          title={t("customer.fields.email.label")}
          description={t("customer.fields.email.description")}
          htmlFor={`${idPrefix}-email`}
        >
          <TextInput
            id={`${idPrefix}-email`}
            type="email"
            value={values.email ?? ""}
            onChange={set("email")}
            placeholder={t("customer.fields.email.placeholder")}
            error={fieldError("email")}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.fields.type.label")}
          description={t("customer.fields.type.description")}
          htmlFor={`${idPrefix}-type`}
        >
          <Select
            id={`${idPrefix}-type`}
            value={values.type ?? "ORGANIZATION"}
            onChange={set("type")}
            options={TYPE_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.titleKey),
            }))}
            error={fieldError("type")}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.fields.status.label")}
          description={t("customer.fields.status.description")}
          htmlFor={`${idPrefix}-status`}
        >
          <Select
            id={`${idPrefix}-status`}
            value={values.status ?? "ACTIVE"}
            onChange={set("status")}
            options={STATUS_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.titleKey),
            }))}
            error={fieldError("status")}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.fields.description.label")}
          description={t("customer.fields.description.description")}
          htmlFor={`${idPrefix}-description`}
        >
          <TextArea
            id={`${idPrefix}-description`}
            value={values.description ?? ""}
            onChange={set("description")}
            placeholder={t("customer.fields.description.placeholder")}
            maxLength={DESCRIPTION_MAX_LENGTH}
            error={fieldError("description")}
          />
        </FieldRow>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-overlay/10">
      <FieldRow
        title={t("customer.fields.network.label")}
        description={t("customer.fields.network.description")}
        htmlFor={`${idPrefix}-network`}
      >
        <Select
          id={`${idPrefix}-network`}
          value={values.network ?? ""}
          onChange={set("network")}
          options={[
            { value: "", title: t("customer.fields.network.none") },
            ...NETWORK_OPTIONS,
          ]}
          error={fieldError("network")}
        />
      </FieldRow>

      <FieldRow
        title={t("customer.fields.address.label")}
        description={t("customer.fields.address.description")}
        htmlFor={`${idPrefix}-address`}
      >
        <TextInput
          id={`${idPrefix}-address`}
          value={values.address ?? ""}
          onChange={set("address")}
          placeholder="0x…"
          maxLength={42}
          error={fieldError("address")}
        />
      </FieldRow>

      <FieldRow
        title={t("customer.fields.dailyLimit.label")}
        description={t("customer.fields.dailyLimit.description")}
        htmlFor={`${idPrefix}-dailyLimit`}
      >
        <TextInput
          id={`${idPrefix}-dailyLimit`}
          value={values.dailyLimit ?? ""}
          onChange={set("dailyLimit")}
          placeholder="0.00"
          error={fieldError("dailyLimit")}
        />
      </FieldRow>

      <FieldRow
        title={t("customer.fields.monthlyLimit.label")}
        description={t("customer.fields.monthlyLimit.description")}
        htmlFor={`${idPrefix}-monthlyLimit`}
      >
        <TextInput
          id={`${idPrefix}-monthlyLimit`}
          value={values.monthlyLimit ?? ""}
          onChange={set("monthlyLimit")}
          placeholder="0.00"
          error={fieldError("monthlyLimit")}
        />
      </FieldRow>

      <FieldRow
        title={t("customer.fields.limitCurrency.label")}
        description={t("customer.fields.limitCurrency.description")}
        htmlFor={`${idPrefix}-limitCurrency`}
      >
        <TextInput
          id={`${idPrefix}-limitCurrency`}
          value={values.limitCurrency ?? ""}
          onChange={set("limitCurrency")}
          format="uppercase"
          maxLength={16}
          placeholder="USD"
          error={fieldError("limitCurrency")}
        />
      </FieldRow>
    </div>
  );
}

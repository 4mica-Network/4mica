import { useTranslation } from "react-i18next";
import {
  FieldRow,
  FormSelect,
  FormTextArea,
  FormTextInput,
} from "@/components/form";
import { NETWORK_OPTIONS } from "@/lib/networks";
import { TYPE_OPTIONS } from "./constants";
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH } from "./validation";

export function CustomerFormFields({
  idPrefix,
  step,
}: {
  idPrefix: string;
  step: number;
}) {
  const { t } = useTranslation();

  if (step === 0) {
    return (
      <div className="flex flex-col divide-y divide-overlay/10">
        <FieldRow
          title={t("customer.fields.name.label")}
          description={t("customer.fields.name.description")}
          htmlFor={`${idPrefix}-name`}
          required
        >
          <FormTextInput
            name="name"
            placeholder={t("customer.fields.name.placeholder")}
            maxLength={NAME_MAX_LENGTH}
            autoFocus
          />
        </FieldRow>

        <FieldRow
          title={t("customer.fields.email.label")}
          description={t("customer.fields.email.description")}
          htmlFor={`${idPrefix}-email`}
        >
          <FormTextInput
            name="email"
            type="email"
            inputMode="email"
            placeholder={t("customer.fields.email.placeholder")}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.fields.type.label")}
          description={t("customer.fields.type.description")}
          htmlFor={`${idPrefix}-type`}
        >
          <FormSelect
            name="type"
            options={TYPE_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.titleKey),
            }))}
          />
        </FieldRow>

        <FieldRow
          title={t("customer.fields.description.label")}
          description={t("customer.fields.description.description")}
          htmlFor={`${idPrefix}-description`}
        >
          <FormTextArea
            name="description"
            placeholder={t("customer.fields.description.placeholder")}
            maxLength={DESCRIPTION_MAX_LENGTH}
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
        <FormSelect
          name="network"
          options={[
            { value: "", title: t("customer.fields.network.none") },
            ...NETWORK_OPTIONS,
          ]}
        />
      </FieldRow>

      <FieldRow
        title={t("customer.fields.address.label")}
        description={t("customer.fields.address.description")}
        htmlFor={`${idPrefix}-address`}
      >
        <FormTextInput name="address" placeholder="0x…" maxLength={42} />
      </FieldRow>

      <FieldRow
        title={t("customer.fields.dailyLimit.label")}
        description={t("customer.fields.dailyLimit.description")}
        htmlFor={`${idPrefix}-dailyLimit`}
      >
        <FormTextInput
          name="dailyLimit"
          inputMode="decimal"
          placeholder="0.00"
        />
      </FieldRow>

      <FieldRow
        title={t("customer.fields.monthlyLimit.label")}
        description={t("customer.fields.monthlyLimit.description")}
        htmlFor={`${idPrefix}-monthlyLimit`}
      >
        <FormTextInput
          name="monthlyLimit"
          inputMode="decimal"
          placeholder="0.00"
        />
      </FieldRow>

      <FieldRow
        title={t("customer.fields.limitCurrency.label")}
        description={t("customer.fields.limitCurrency.description")}
        htmlFor={`${idPrefix}-limitCurrency`}
      >
        <FormTextInput
          name="limitCurrency"
          format="uppercase"
          maxLength={16}
          placeholder="USD"
        />
      </FieldRow>
    </div>
  );
}

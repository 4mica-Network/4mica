import { Button, Spinner } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { customerPendingKeys, updateCustomer } from "@stores/customer/actions";
import {
  selectCustomerIssues,
  selectIsCustomerPending,
} from "@stores/customer/selector";
import type { Customer } from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { blankToNull } from "@utils/format";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import {
  FieldRow,
  Form,
  FormSelect,
  FormTextArea,
  FormTextInput,
} from "@/components/form";
import { SectionCard, SectionFooter } from "@/components/layout";
import { useServerIssues } from "@/hooks/useServerIssues";
import { TYPE_OPTIONS } from "../customers/constants";
import {
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
    selectIsCustomerPending(customerPendingKeys.row(customer.id)),
  );
  const issues = useAppSelector(selectCustomerIssues);

  const { name, email, type, description, notes } = customer;
  const defaults = useMemo<DetailsValues>(
    () => ({
      name,
      email: email ?? "",
      type,
      description: description ?? "",
      notes: notes ?? "",
    }),
    [name, email, type, description, notes],
  );

  const form = useForm<DetailsValues>({
    resolver: zodResolver(customerDetailsSchema),
    mode: "onTouched",
    values: defaults,
  });
  const {
    handleSubmit,
    reset,
    setError,
    formState: { isDirty },
  } = form;
  useServerIssues(issues, setError);

  const onValid = (data: DetailsValues) => {
    dispatch(
      updateCustomer({
        id: customer.id,
        data: {
          name: data.name.trim(),
          email: blankToNull(data.email),
          type: data.type,
          description: blankToNull(data.description),
          notes: blankToNull(data.notes),
        },
      }),
    );
  };

  return (
    <SectionCard
      title={t("customer.detail.detailsTitle")}
      description={t("customer.detail.detailsLead")}
      data-testid="customer-details"
    >
      <Form form={form} onSubmit={handleSubmit(onValid)}>
        <div className="flex flex-col gap-4">
          <FieldRow
            title={t("customer.fields.name.label")}
            htmlFor="detail-name"
            required
          >
            <FormTextInput name="name" maxLength={NAME_MAX_LENGTH} />
          </FieldRow>

          <FieldRow
            title={t("customer.fields.email.label")}
            htmlFor="detail-email"
          >
            <FormTextInput name="email" type="email" inputMode="email" />
          </FieldRow>

          <FieldRow
            title={t("customer.fields.type.label")}
            htmlFor="detail-type"
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
            htmlFor="detail-description"
          >
            <FormTextArea
              name="description"
              maxLength={DESCRIPTION_MAX_LENGTH}
            />
          </FieldRow>

          <FieldRow
            title={t("customer.fields.notes.label")}
            htmlFor="detail-notes"
          >
            <FormTextArea name="notes" rows={4} maxLength={NOTES_MAX_LENGTH} />
          </FieldRow>
        </div>

        <div className="mt-5">
          <SectionFooter>
            <Button
              intent="ghost"
              size="sm"
              disabled={!isDirty || isSaving}
              onClick={() => reset(defaults)}
            >
              {t("settings.discard")}
            </Button>
            <Button
              type="submit"
              intent="invert"
              size="sm"
              className="btn-no-lift w-20"
              disabled={!isDirty || isSaving}
              aria-busy={isSaving}
              data-testid="customer-details-save"
            >
              <span className="flex w-full items-center justify-center text-sm">
                {isSaving ? <Spinner size="sm" /> : t("settings.update")}
              </span>
            </Button>
          </SectionFooter>
        </div>
      </Form>
    </SectionCard>
  );
}

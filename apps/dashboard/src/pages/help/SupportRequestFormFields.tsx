import type { SupportPriority } from "@stores/support/type";
import { useMemo } from "react";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  FieldRow,
  FormSelect,
  FormTextArea,
  FormTextInput,
} from "@/components/form";
import { useConfigList } from "@/hooks/useConfigOptions";
import {
  categoryLabelKey,
  PRIORITY_HINT_KEYS,
  PRIORITY_LABEL_KEYS,
} from "./constants";
import {
  BODY_MAX_LENGTH,
  REFERENCE_MAX_LENGTH,
  SUBJECT_MAX_LENGTH,
} from "./validation";

export function SupportRequestFormFields({
  idPrefix,
  showCategory = false,
  showDescription = true,
  autoFocus = true,
}: {
  idPrefix: string;
  showCategory?: boolean;
  showDescription?: boolean;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const categories = useConfigList("supportCategories");
  const priorities = useConfigList("supportPriorities");
  const priority = useWatch({ name: "priority" }) as SupportPriority;

  const categoryOptions = useMemo(
    () =>
      categories.map((value) => ({
        value,
        title: t(categoryLabelKey(value)),
      })),
    [categories, t],
  );

  const priorityOptions = useMemo(
    () =>
      priorities.map((value) => ({
        value,
        title: t(PRIORITY_LABEL_KEYS[value as SupportPriority] ?? value),
      })),
    [priorities, t],
  );

  return (
    <div className="flex flex-col divide-y divide-overlay/10">
      <FieldRow
        title={t("help.fields.subject.label")}
        description={t("help.fields.subject.description")}
        htmlFor={`${idPrefix}-subject`}
        required
      >
        <FormTextInput
          name="subject"
          placeholder={t("help.fields.subject.placeholder")}
          maxLength={SUBJECT_MAX_LENGTH}
          autoFocus={autoFocus}
        />
      </FieldRow>

      {showCategory && (
        <FieldRow
          title={t("help.fields.category.label")}
          htmlFor={`${idPrefix}-category`}
        >
          <FormSelect name="category" options={categoryOptions} />
        </FieldRow>
      )}

      <FieldRow
        title={t("help.fields.priority.label")}
        description={t(
          PRIORITY_HINT_KEYS[priority] ?? "help.fields.priority.description",
        )}
        htmlFor={`${idPrefix}-priority`}
      >
        <FormSelect name="priority" options={priorityOptions} />
      </FieldRow>

      {showDescription && (
        <FieldRow
          title={t("help.fields.description.label")}
          description={t("help.fields.description.description")}
          htmlFor={`${idPrefix}-description`}
          required
        >
          <FormTextArea
            name="description"
            rows={6}
            placeholder={t("help.fields.description.placeholder")}
            maxLength={BODY_MAX_LENGTH}
          />
        </FieldRow>
      )}

      <FieldRow
        title={t("help.fields.reference.label")}
        description={t("help.fields.reference.description")}
        htmlFor={`${idPrefix}-reference`}
      >
        <FormTextInput
          name="reference"
          placeholder={t("help.fields.reference.placeholder")}
          maxLength={REFERENCE_MAX_LENGTH}
        />
      </FieldRow>
    </div>
  );
}

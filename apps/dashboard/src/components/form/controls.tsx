import {
  type ComboBoxProps,
  InputField,
  type InputFieldProps,
  type Option,
  ComboBox as UiComboBox,
  Select as UiSelect,
} from "@4mica/ui";
import type {
  FocusEventHandler,
  KeyboardEventHandler,
  ReactNode,
  Ref,
} from "react";
import { useTranslation } from "react-i18next";
import { useFieldA11y } from "./Field";

type InputMode = InputFieldProps["inputMode"];

interface NativeTextProps {
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  maxLength?: number;
  autoFocus?: boolean;
  autoComplete?: string;
  spellCheck?: boolean;
  required?: boolean;
  "aria-label"?: string;
  onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  ref?: Ref<HTMLInputElement | HTMLTextAreaElement>;
}

export interface TextInputProps extends NativeTextProps {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "url" | "tel" | "search" | "password" | "date";
  inputMode?: InputMode;
  prefix?: string;
  format?: "lowercase" | "uppercase";
  trailingIcon?: ReactNode;
}

export function TextInput({
  id,
  onChange,
  required,
  ...props
}: TextInputProps) {
  const field = useFieldA11y();
  return (
    <InputField
      {...props}
      id={id ?? field.id}
      required={required ?? field.required}
      aria-describedby={field.describedBy}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export interface TextAreaProps extends NativeTextProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}

export function TextArea({
  id,
  onChange,
  rows = 3,
  required,
  spellCheck = true,
  ...props
}: TextAreaProps) {
  const field = useFieldA11y();
  return (
    <InputField
      {...props}
      variant="textarea"
      id={id ?? field.id}
      rows={rows}
      required={required ?? field.required}
      spellCheck={spellCheck}
      aria-describedby={field.describedBy}
      allowResizing
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export interface SelectProps {
  id?: string;
  ref?: Ref<HTMLButtonElement>;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
  error?: string;
  hasSearch?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}

export function Select({ id, onChange, ...props }: SelectProps) {
  const { t } = useTranslation();
  const field = useFieldA11y();
  const controlId = id ?? field.id;
  return (
    <UiSelect
      searchPlaceholder={t("form.search")}
      noDataText={t("form.noResults")}
      noResultsText={t("form.noResults")}
      {...props}
      id={controlId}
      aria-describedby={field.describedBy}
      data-testid={controlId}
      onChange={(option) => option && onChange(String(option.value))}
    />
  );
}

export function ComboBox({
  id,
  ...props
}: Omit<
  ComboBoxProps,
  "selectedText" | "noResultsText" | "searchPlaceholder"
>) {
  const { t } = useTranslation();
  const field = useFieldA11y();
  return (
    <UiComboBox
      {...props}
      id={id ?? field.id}
      aria-describedby={field.describedBy}
      searchPlaceholder={t("form.search")}
      noResultsText={t("form.noResults")}
      selectedText={(count) => t("form.selectedCount", { count })}
    />
  );
}

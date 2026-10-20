import type { FormEvent, ReactNode } from "react";
import {
  type FieldValues,
  FormProvider,
  type UseFormReturn,
  useController,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  Select,
  type SelectProps,
  TextArea,
  type TextAreaProps,
  TextInput,
  type TextInputProps,
} from "./controls";

export function Form<T extends FieldValues>({
  form,
  id,
  className,
  onSubmit,
  children,
}: {
  form: UseFormReturn<T>;
  id?: string;
  className?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <FormProvider {...form}>
      <form id={id} className={className} noValidate onSubmit={onSubmit}>
        {children}
      </form>
    </FormProvider>
  );
}

const useConnectedField = (name: string) => {
  const { t } = useTranslation();
  const { field, fieldState } = useController({ name });
  const error = fieldState.error;
  const message = error?.message
    ? error.type === "server"
      ? error.message
      : t(error.message)
    : undefined;
  return { field, error: message };
};

type Connected<P> = Omit<
  P,
  "value" | "onChange" | "onBlur" | "error" | "ref"
> & {
  name: string;
};

export function FormTextInput({ name, ...props }: Connected<TextInputProps>) {
  const { field, error } = useConnectedField(name);
  return (
    <TextInput
      {...props}
      name={field.name}
      value={field.value ?? ""}
      onChange={field.onChange}
      onBlur={field.onBlur}
      ref={field.ref}
      error={error}
    />
  );
}

export function FormTextArea({ name, ...props }: Connected<TextAreaProps>) {
  const { field, error } = useConnectedField(name);
  return (
    <TextArea
      {...props}
      name={field.name}
      value={field.value ?? ""}
      onChange={field.onChange}
      onBlur={field.onBlur}
      ref={field.ref}
      error={error}
    />
  );
}

export function FormSelect({ name, ...props }: Connected<SelectProps>) {
  const { field, error } = useConnectedField(name);

  return (
    <Select
      {...props}
      ref={field.ref}
      value={String(field.value ?? "")}
      onChange={(value) => {
        field.onChange(value);
        field.onBlur();
      }}
      error={error}
    />
  );
}

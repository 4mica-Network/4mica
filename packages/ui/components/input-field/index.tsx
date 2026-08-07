import { Asterisk } from "lucide-react";
import type {
  ChangeEvent,
  ClipboardEvent,
  CSSProperties,
  FocusEventHandler,
  ForwardedRef,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  Ref,
  RefCallback,
} from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/cn";

/**
 * Structurally identical to react-hook-form's UseFormRegisterReturn, so
 * `register={form.register("name")}` typechecks without this package taking a
 * dependency on react-hook-form or leaking the type into its declarations.
 */
export interface RegisterLike {
  name: string;
  onChange: (event: unknown) => unknown;
  onBlur: (event: unknown) => unknown;
  ref: Ref<HTMLInputElement | HTMLTextAreaElement>;
  min?: string | number;
  max?: string | number;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  required?: boolean;
  disabled?: boolean;
}

type Formatter = "lowercase" | "uppercase" | ((value: string) => string);

type BaseProps = {
  id?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  register?: RegisterLike;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  autoCorrect?: "on" | "off";
  autoCapitalize?: "on" | "off" | "none" | "sentences" | "words" | "characters";
  spellCheck?: boolean;
  autoFocus?: boolean;
  rows?: number;
  inputMode?:
    | "none"
    | "text"
    | "search"
    | "email"
    | "tel"
    | "url"
    | "numeric"
    | "decimal";
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  prefix?: string | ReactNode;
  value?: string | number;
  disabled?: boolean;
  style?: CSSProperties;
  readOnly?: boolean;
  allowResizing?: boolean;
  maxAutoHeight?: number;
  min?: number;
  max?: number;
  pattern?: string;
  maxLength?: number;
  title?: string;
  format?: Formatter;
  onClick?: (e: MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onKeyDown?: (
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onPaste?: (e: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFocus?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
};

type InputVariant = BaseProps & { variant?: "input"; type?: string };
type TextAreaVariant = BaseProps & { variant: "textarea" };

export type InputFieldProps = InputVariant | TextAreaVariant;

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref && typeof ref === "object") {
        (ref as { current: T | null }).current = value;
      }
    }
  };
}

const applyFormat = (value: string, format?: Formatter): string => {
  if (!format) return value;
  if (typeof format === "function") return format(value);
  return format === "lowercase" ? value.toLowerCase() : value.toUpperCase();
};

export const InputField = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InputFieldProps
>((props, ref) => {
  const {
    id,
    label,
    placeholder = "",
    variant = "input",
    inputMode,
    pattern,
    className,
    register,
    autoComplete = "off",
    autoCorrect = "off",
    autoCapitalize = "none",
    spellCheck = false,
    autoFocus = false,
    rows = 4,
    error,
    required,
    icon,
    trailingIcon,
    prefix,
    value,
    disabled,
    style,
    readOnly,
    allowResizing = false,
    maxAutoHeight = 400,
    min,
    max,
    maxLength,
    format,
    onClick,
    onChange,
    ...rest
  } = props;

  const type = "type" in props ? (props.type ?? "text") : "text";

  // register.ref is pulled out so it can be merged rather than overwrite ours.
  const {
    ref: registerRef,
    onChange: registerOnChange,
    onBlur: registerOnBlur,
    name: registerName,
    ...registerRest
  } = (register ?? {}) as Partial<RegisterLike>;

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isControlled = value !== undefined;
  const [local, setLocal] = useState(() =>
    typeof value === "string" ? applyFormat(value, format) : (value ?? ""),
  );

  const adjustTextareaHeight = useCallback(() => {
    const el = textAreaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const natural = el.scrollHeight;
    el.style.height = `${Math.min(natural, maxAutoHeight)}px`;
    el.style.overflowY = natural > maxAutoHeight ? "auto" : "hidden";
  }, [maxAutoHeight]);

  useEffect(() => {
    if (!autoFocus) return;
    (textAreaRef.current ?? inputRef.current)?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (typeof value === "string") {
      setLocal(applyFormat(value, format));
    } else if (value !== undefined) {
      setLocal(value);
    }
    // format is intentionally excluded: an inline function would change
    // identity every render and reset what the user is typing.
  }, [value]);

  useEffect(() => {
    if (!allowResizing || variant !== "textarea") return;
    const id = requestAnimationFrame(adjustTextareaHeight);
    return () => cancelAnimationFrame(id);
  }, [allowResizing, variant, adjustTextareaHeight]);

  const baseClass = cn(
    "w-full rounded-lg border border-overlay/15 bg-transparent px-3 py-2.5 text-ink-body text-sm shadow-none outline-none transition placeholder:text-ink-subtle hover:border-overlay/30 focus:border-overlay/50 focus:outline-none focus:ring-1 focus:ring-overlay/40 disabled:opacity-50",
    variant === "textarea"
      ? cn("min-h-[60px]", allowResizing ? "resize-y" : "resize-none")
      : "max-h-[240px]",
    variant === "input" && prefix && "rounded-l-none border-l-0 focus:ring-0",
    error && "border-danger focus:border-danger focus:ring-danger/40",
    className,
  );

  const generatedId = useId();
  const inputId =
    id ??
    (registerName ? `input-${registerName}` : label ? generatedId : undefined);
  const errorId = error && inputId ? `${inputId}-error` : undefined;

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const next = applyFormat(e.target.value, format);
    if (next !== e.target.value) {
      e.target.value = next;
    }
    setLocal(next);
    if (allowResizing) adjustTextareaHeight();
    registerOnChange?.(e);
    onChange?.(e);
  };

  const shared = {
    id: inputId,
    placeholder,
    autoComplete,
    autoCorrect,
    autoCapitalize,
    spellCheck,
    disabled: disabled ?? registerRest.disabled,
    style,
    readOnly,
    maxLength: maxLength ?? registerRest.maxLength,
    name: registerName,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": errorId,
    onClick,
    onChange: handleChange,
    onBlur: registerOnBlur as FocusEventHandler<
      HTMLInputElement | HTMLTextAreaElement
    >,
  };

  return (
    <div className="w-full">
      {label && (
        <label
          className="mb-2.5 flex select-none items-center gap-1 font-medium text-ink-muted text-sm"
          htmlFor={inputId}
        >
          <span className="leading-none">{label}</span>
          {required && (
            <Asterisk className="h-2 w-2 text-danger" aria-hidden="true" />
          )}
        </label>
      )}

      {variant === "textarea" ? (
        <textarea
          {...shared}
          className={baseClass}
          rows={rows}
          value={isControlled ? applyFormat(String(value), format) : local}
          ref={mergeRefs(
            textAreaRef,
            ref as ForwardedRef<HTMLTextAreaElement>,
            registerRef,
          )}
          {...rest}
        />
      ) : (
        <div
          className={cn(
            "group relative flex w-full rounded-lg",
            prefix && "focus-within:ring-1 focus-within:ring-overlay/40",
          )}
        >
          {prefix && (
            <span className="flex items-center whitespace-nowrap rounded-l-lg border border-overlay/15 bg-overlay/5 px-3 py-2.5 text-ink-muted text-sm transition group-focus-within:border-overlay/50 group-hover:border-overlay/30">
              {prefix}
            </span>
          )}

          {icon && (
            <div className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle">
              {icon}
            </div>
          )}

          {trailingIcon && (
            <div className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-ink-muted">
              {trailingIcon}
            </div>
          )}

          <input
            {...shared}
            type={type}
            inputMode={inputMode}
            pattern={pattern ?? registerRest.pattern}
            min={min ?? (registerRest.min as number | undefined)}
            max={max ?? (registerRest.max as number | undefined)}
            value={isControlled ? applyFormat(String(value), format) : local}
            className={cn(
              baseClass,
              icon && "pl-8",
              trailingIcon && "pr-8",
              disabled && "select-none",
              type === "number" &&
                "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            )}
            ref={mergeRefs(
              inputRef,
              ref as ForwardedRef<HTMLInputElement>,
              registerRef as Ref<HTMLInputElement>,
            )}
            {...rest}
          />
        </div>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-2 select-none font-normal text-danger text-xs"
        >
          {error}
        </p>
      )}
    </div>
  );
});

InputField.displayName = "InputField";

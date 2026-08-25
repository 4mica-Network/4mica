import {
  cn,
  InputField,
  type Option,
  Switch,
  Tag,
  Select as UiSelect,
} from "@4mica/ui";
import { Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export type { Option };
export { Switch };

/** Mirrors the `BusinessType` enum; the blank entry clears the field. */
export const BUSINESS_TYPES: Option[] = [
  { title: "—", value: "" },
  { title: "Sole trader", value: "SOLE_TRADER" },
  { title: "Partnership", value: "PARTNERSHIP" },
  { title: "LLC", value: "LLC" },
  { title: "Corporation", value: "CORPORATION" },
  { title: "Non-profit", value: "NON_PROFIT" },
];

/** Empty strings mean "clear this optional field"; the API expects null. */
export const blankToNull = (
  changes: Record<string, unknown>,
  keep: string[] = [],
) =>
  Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [
      key,
      value === "" && !keep.includes(key) ? null : value,
    ]),
  );

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-overlay/10 bg-surface px-6 py-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Heading and blurb that sit above a group of cards, outside their borders. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <h3 className="font-semibold text-base text-ink-strong">{title}</h3>
      {description && (
        <p className="mt-1 text-ink-muted text-sm">{description}</p>
      )}
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function CardHeader({
  title,
  description,
  isSaving,
  action,
}: {
  title: string;
  description?: string;
  isSaving?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h4 className="font-semibold text-ink-strong text-sm">{title}</h4>
        {description && (
          <p className="mt-0.5 text-ink-muted text-xs">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isSaving && (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-ink-subtle"
            role="status"
            aria-label="Saving"
          />
        )}
        {action}
      </div>
    </div>
  );
}

/**
 * Label and description stacked above a full-width control. `action` sits
 * opposite the label so badges do not eat into the control's width.
 */
export function FieldRow({
  title,
  description,
  htmlFor,
  action,
  children,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col py-3 first:pt-0 last:pb-0">
      {/* items-end keeps the action level with the bottom of the label block,
          so it sits just above the control rather than up beside the title. */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <label
            htmlFor={htmlFor}
            className="font-medium text-ink-strong text-sm"
          >
            {title}
          </label>
          {description && (
            <p className="mt-0.5 text-ink-muted text-xs">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Label and description on the left, compact control on the right. */
export function SettingRow({
  title,
  description,
  htmlFor,
  error,
  children,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 sm:pr-6">
        <label
          htmlFor={htmlFor}
          className="font-medium text-ink-strong text-sm"
        >
          {title}
        </label>
        {description && (
          <p className="mt-0.5 text-ink-muted text-xs">{description}</p>
        )}
        {error && (
          <p className="mt-1 text-danger text-xs" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="w-full shrink-0 sm:w-64">{children}</div>
    </div>
  );
}

/** A single toggle in its own card. */
export function SwitchCard({
  id,
  title,
  description,
  checked,
  onToggle,
  disabled,
  isSaving,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
  isSaving?: boolean;
}) {
  return (
    <Card className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span className="font-medium text-ink-strong text-sm">{title}</span>
        {description && (
          <p className="mt-0.5 text-ink-muted text-xs">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isSaving && (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-ink-subtle"
            role="status"
            aria-label="Saving"
          />
        )}
        <Switch
          data-testid={id}
          aria-label={title}
          initialState={checked}
          onToggle={onToggle}
          disabled={disabled}
        />
      </div>
    </Card>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  error,
  prefix,
  format,
  maxLength,
  trailingIcon,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  error?: string;
  prefix?: string;
  format?: "lowercase" | "uppercase";
  maxLength?: number;
  /** Status affordance inside the field — a spinner, tick or cross. */
  trailingIcon?: ReactNode;
  autoFocus?: boolean;
}) {
  return (
    <InputField
      id={id}
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      error={error}
      prefix={prefix}
      format={format}
      maxLength={maxLength}
      trailingIcon={trailingIcon}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
  disabled,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <InputField
      variant="textarea"
      id={id}
      rows={rows}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      error={error}
      allowResizing
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Thin wrapper over the library Select so pages keep working with plain
 * string values instead of Option objects.
 */
export function Select({
  id,
  value,
  onChange,
  options,
  disabled,
  error,
  hasSearch,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
  error?: string;
  hasSearch?: boolean;
  placeholder?: string;
}) {
  return (
    <UiSelect
      data-testid={id}
      value={value}
      options={options}
      disabled={disabled}
      error={error}
      hasSearch={hasSearch}
      placeholder={placeholder}
      onChange={(option) => option && onChange(String(option.value))}
    />
  );
}

const KYB_VARIANT = {
  VERIFIED: "success",
  PENDING: "warning",
  REJECTED: "error",
  UNVERIFIED: "neutral",
} as const;

/** KYB has four states, so it gets its own tag rather than a yes/no badge. */
export function KybTag({ status, label }: { status: string; label: string }) {
  const variant = KYB_VARIANT[status as keyof typeof KYB_VARIANT] ?? "neutral";

  return (
    <Tag
      size="sm"
      variant={variant}
      icon={status === "VERIFIED" ? <Check className="h-3 w-3" /> : undefined}
      className="shrink-0"
    >
      {label}
    </Tag>
  );
}

export function VerifiedBadge({
  verified,
  labels,
}: {
  verified: boolean;
  labels: { yes: string; no: string };
}) {
  return (
    <Tag
      size="sm"
      variant={verified ? "success" : "neutral"}
      icon={verified ? <Check className="h-3 w-3" /> : undefined}
      className="shrink-0"
    >
      {verified ? labels.yes : labels.no}
    </Tag>
  );
}

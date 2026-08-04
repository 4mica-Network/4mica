import { cn, InputField, Switch } from "@4mica/ui";
import { Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export { Switch };

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

/** Label and description stacked above a full-width control. */
export function FieldRow({
  title,
  description,
  htmlFor,
  children,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col py-3 first:pt-0 last:pb-0">
      <label htmlFor={htmlFor} className="font-medium text-ink-strong text-sm">
        {title}
      </label>
      {description && (
        <p className="mt-0.5 text-ink-muted text-xs">{description}</p>
      )}
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

const selectClass =
  "w-full rounded-lg border border-overlay/15 bg-transparent px-3 py-2.5 text-ink-body text-sm outline-none transition hover:border-overlay/30 focus:border-overlay/50 focus:ring-1 focus:ring-overlay/40 disabled:opacity-50";

export function Select({
  id,
  value,
  onChange,
  options,
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn(selectClass, invalid && "border-danger")}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs",
        verified
          ? "bg-emerald-500/15 text-emerald-500"
          : "bg-overlay/10 text-ink-muted",
      )}
    >
      {verified && <Check className="h-3 w-3" />}
      {verified ? labels.yes : labels.no}
    </span>
  );
}

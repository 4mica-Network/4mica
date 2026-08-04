import { cn } from "@4mica/ui";
import { Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

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
        "rounded-lg border border-overlay/10 bg-surface p-5",
        className,
      )}
    >
      {children}
    </div>
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
        <h3 className="font-semibold text-ink-strong text-sm">{title}</h3>
        {description && (
          <p className="mt-0.5 text-ink-muted text-xs">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isSaving && (
          <span
            className="flex items-center gap-1.5 text-ink-subtle text-xs"
            role="status"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
          </span>
        )}
        {action}
      </div>
    </div>
  );
}

/** Label + description on the left, control on the right. */
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
    <div className="flex flex-col gap-3 border-overlay/10 border-t py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
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

const controlClass =
  "h-9 w-full rounded-md border border-overlay/15 bg-transparent px-3 text-ink-body text-sm outline-none transition-colors placeholder:text-ink-subtle focus:border-overlay/40 disabled:opacity-50";

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn(controlClass, invalid && "border-danger")}
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
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        controlClass,
        "h-auto resize-y py-2",
        invalid && "border-danger",
      )}
    />
  );
}

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
      className={cn(controlClass, invalid && "border-danger")}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Switch({
  id,
  checked,
  onToggle,
  label,
  disabled,
}: {
  id: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onToggle(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-ink-strong" : "bg-overlay/20",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-surface-deep transition-transform",
          checked ? "translate-x-4.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** Toggle rendered as a full row — the common case on these pages. */
export function SwitchRow({
  id,
  title,
  description,
  checked,
  onToggle,
  disabled,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-overlay/10 border-t py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <span className="font-medium text-ink-strong text-sm">{title}</span>
        {description && (
          <p className="mt-0.5 text-ink-muted text-xs">{description}</p>
        )}
      </div>
      <Switch
        id={id}
        label={title}
        checked={checked}
        onToggle={onToggle}
        disabled={disabled}
      />
    </div>
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs",
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
